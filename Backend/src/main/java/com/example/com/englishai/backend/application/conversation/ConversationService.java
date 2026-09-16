package com.example.com.englishai.backend.application.conversation;

import com.example.com.englishai.backend.application.chat.*;
import com.example.com.englishai.backend.application.catalog.AssistantIdentityResolver;
import com.example.com.englishai.backend.application.profile.ProfileService;
import com.example.com.englishai.backend.application.translation.Language;
import com.example.com.englishai.backend.infrastructure.persistence.entity.*;
import com.example.com.englishai.backend.infrastructure.persistence.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.util.*;
import java.util.function.Consumer;

@Service
public class ConversationService {
    private final ConversationJpaRepository conversations;
    private final UserJpaRepository users;
    public static final int MAX_CONVERSATIONS = 3;
    private final ConversationMessageJpaRepository messages;
    private final ChatWithTutor chat;
    private final ProfileService profiles;
    private final ScenarioDefinitionJpaRepository definitions;
    private final AssistantIdentityResolver identities;
    private final ConversationPromptBuilder promptBuilder = new ConversationPromptBuilder();
    private final TransactionTemplate writes;

    public ConversationService(ConversationJpaRepository conversations, ConversationMessageJpaRepository messages,
                               ChatWithTutor chat, ProfileService profiles, ScenarioDefinitionJpaRepository definitions,
                               AssistantIdentityResolver identities, PlatformTransactionManager transactionManager,
                               UserJpaRepository users) {
        this.users = users;
        this.conversations = conversations;
        this.messages = messages;
        this.chat = chat;
        this.profiles = profiles;
        this.definitions = definitions;
        this.identities = identities;
        writes = new TransactionTemplate(transactionManager);
        writes.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        writes.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ConversationEntity create(UUID userId, ConversationScenario scenario, String language) {
        if (scenario == null) throw new IllegalArgumentException("Scenario is required");
        return create(userId, scenario.name(), language, ConversationDifficulty.INTERMEDIATE);
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ConversationEntity create(UUID userId, String scenarioKey, String language) {
        return create(userId, scenarioKey, language, ConversationDifficulty.INTERMEDIATE);
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ConversationEntity create(UUID userId, String scenarioKey, String language, String difficulty) {
        return create(userId, scenarioKey, language, ConversationDifficulty.from(difficulty));
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ConversationEntity create(UUID userId, String scenarioKey, String language, ConversationDifficulty difficulty) {
        var parsedDifficulty = difficulty == null ? ConversationDifficulty.INTERMEDIATE : difficulty;
        var definition = definition(scenarioKey);
        if (!definition.isEnabled()) throw new IllegalStateException("Scenario disabled");
        var parsedLanguage = Language.fromCode(language);
        checkCapacity(userId);
        var opening = chat.opening(parsedLanguage, context(userId, definition, parsedDifficulty));
        // No durable empty conversation: external generation precedes a single short atomic write.
        return writes.execute(status -> {
            // Serialize final admission across server instances, without holding a lock during LLM work.
            users.findByIdForUpdate(userId).orElseThrow(() -> new NoSuchElementException("User not found"));
            checkCapacity(userId);
            if (!definition(scenarioKey).isEnabled()) throw new IllegalStateException("Scenario disabled");
            var now = OffsetDateTime.now(ZoneOffset.UTC);
            var conversation = conversations.save(new ConversationEntity(UUID.randomUUID(), userId, scenarioKey,
                    parsedLanguage.code(), definition.getDisplayName(), now, parsedDifficulty));
            messages.save(new ConversationMessageEntity(UUID.randomUUID(), conversation.getId(), "ASSISTANT",
                    opening.reply(), null, now));
            return conversation;
        });
    }

    @Transactional(readOnly = true)
    public List<ConversationEntity> list(UUID userId) {
        return conversations.findByUserIdOrderByUpdatedAtDesc(userId);
    }

    private void checkCapacity(UUID userId) {
        if (conversations.countByUserId(userId) >= MAX_CONVERSATIONS) throw new ConversationLimitReachedException();
    }

    @Transactional(readOnly = true)
    public ConversationEntity require(UUID userId, UUID id) {
        return conversations.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new NoSuchElementException("Conversation not found"));
    }

    @Transactional(readOnly = true)
    public List<ConversationMessageEntity> history(UUID userId, UUID id) {
        require(userId, id);
        return messages.findByConversationIdOrderByCreatedAtAsc(id);
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        conversations.delete(require(userId, id));
    }

    public ConversationMessageEntity addMessage(UUID userId, UUID id, String role, String content, String corrected) {
        ChatRole.valueOf(role);
        return writes.execute(status -> {
            var conversation = require(userId, id);
            var now = OffsetDateTime.now(ZoneOffset.UTC);
            var message = messages.save(new ConversationMessageEntity(UUID.randomUUID(), id, role, content, corrected, now));
            conversation.touch(now);
            conversations.save(conversation);
            return message;
        });
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ChatWithTutorResult chat(UUID userId, UUID id, String content) {
        return respond(userId, id, content, null);
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public ChatWithTutorResult stream(UUID userId, UUID id, String content, Consumer<String> onChunk) {
        Objects.requireNonNull(onChunk, "onChunk");
        return respond(userId, id, content, onChunk);
    }

    private ChatWithTutorResult respond(UUID userId, UUID id, String content, Consumer<String> onChunk) {
        var conversation = require(userId, id);
        var recent = new ArrayList<>(messages.findTop10ByConversationIdOrderByCreatedAtDesc(id));
        Collections.reverse(recent);
        var prior = recent.stream().map(message -> new ChatHistoryMessage(ChatRole.valueOf(message.getRole()), message.getContent())).toList();
        var command = new ChatWithTutorCommand(content, Language.fromCode(conversation.getLanguage()), prior);
        chat.validateRequest(command);
        var context = context(userId, definition(conversation.getScenarioKey()), conversation.getDifficulty());
        addMessage(userId, id, "USER", content, null);
        var result = onChunk == null ? chat.execute(command, context) : chat.stream(command, onChunk, context);
        addMessage(userId, id, "ASSISTANT", result.reply(), result.hasCorrection() ? result.correctedText() : null);
        return result;
    }

    private ConversationScenarioDefinitionEntity definition(String key) {
        if (key == null || !key.matches("[A-Z][A-Z0-9_]{2,63}"))
            throw new IllegalArgumentException("Invalid scenario key");
        return definitions.findByScenarioKey(key).orElseThrow(() -> new NoSuchElementException("Scenario not found"));
    }

    private String context(UUID userId, ConversationScenarioDefinitionEntity definition, ConversationDifficulty difficulty) {
        return promptBuilder.build(profiles.context(userId), definition.getScenarioKey(), definition.getDisplayName(),
                definition.getDescription(), identities.resolve(definition.getAssistantAvatarKey()).displayName(), definition.getBehaviorInstructions(), difficulty);
    }
}
