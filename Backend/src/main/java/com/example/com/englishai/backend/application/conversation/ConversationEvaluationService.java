package com.example.com.englishai.backend.application.conversation;

import com.example.com.englishai.backend.application.llm.LlmProviderException;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.infrastructure.persistence.entity.*;
import com.example.com.englishai.backend.infrastructure.persistence.repository.*;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.function.Supplier;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class ConversationEvaluationService {
    public static final int MIN_USER_MESSAGES = 5;
    public static final int SUCCESS_THRESHOLD = 60;
    public static final int OPENING_MESSAGES = 8;
    public static final int RECENT_MESSAGES = 32;
    private static final ObjectMapper JSON = new ObjectMapper();
    private final ConversationJpaRepository conversations;
    private final ConversationMessageJpaRepository messages;
    private final ConversationEvaluationJpaRepository evaluations;
    private final LlmProvider provider;
    private final Clock clock;
    private final TransactionTemplate writes;
    private final LocalOperationLocks localLocks = new LocalOperationLocks();
    private final ConversationEvaluationPromptBuilder prompts = new ConversationEvaluationPromptBuilder();

    @Autowired
    public ConversationEvaluationService(ConversationJpaRepository conversations, ConversationMessageJpaRepository messages,
            ConversationEvaluationJpaRepository evaluations, LlmProvider provider, PlatformTransactionManager manager) {
        this(conversations, messages, evaluations, provider, Clock.systemUTC(), manager);
    }
    public ConversationEvaluationService(ConversationJpaRepository conversations, ConversationMessageJpaRepository messages,
            ConversationEvaluationJpaRepository evaluations, LlmProvider provider, Clock clock) {
        this(conversations, messages, evaluations, provider, clock, null);
    }
    public ConversationEvaluationService(ConversationJpaRepository conversations, ConversationMessageJpaRepository messages,
            ConversationEvaluationJpaRepository evaluations, LlmProvider provider, Clock clock, PlatformTransactionManager manager) {
        this.conversations=conversations; this.messages=messages; this.evaluations=evaluations; this.provider=provider; this.clock=clock;
        this.writes = manager == null ? null : new TransactionTemplate(manager);
        if (writes != null) writes.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public enum Result { INSUFFICIENT, SUCCESS, NEEDS_PRACTICE }
    public record Scores(int communication, int grammar, int vocabulary, int fluency, Integer relevance, int overall) {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Evaluation(UUID conversationId, Result status, Scores scores, List<String> strengths,
            List<String> improvements, OffsetDateTime evaluatedAt, Integer minimumUserMessages, Long currentUserMessages) {}

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Evaluation complete(UUID userId, UUID conversationId) {
        return localLocks.run(conversationId, () -> completeWithoutLongTransaction(userId, conversationId));
    }

    private Evaluation completeWithoutLongTransaction(UUID userId, UUID conversationId) {
        var prepared = shortTransaction(() -> prepare(userId, conversationId));
        if (prepared.immediate() != null) return prepared.immediate();
        var answer = provider.complete(prepared.prompt());
        JsonNode root = parse(answer == null ? null : answer.content());
        int communication = score(root, "communication"), grammar = score(root, "grammar"),
                vocabulary = score(root, "vocabulary"), fluency = score(root, "fluency"), relevance = score(root, "relevance");
        List<String> strengths = feedback(root.path("strengths")), improvements = feedback(root.path("improvements"));
        int overall = (communication + grammar + vocabulary + fluency + relevance + 2) / 5;
        var result = overall >= SUCCESS_THRESHOLD && relevance >= 50 && communication >= 50 ? Result.SUCCESS : Result.NEEDS_PRACTICE;
        return shortTransaction(() -> persist(userId, conversationId, prepared.messageCount(),
                communication, grammar, vocabulary, fluency, relevance, overall, result, strengths, improvements));
    }

    private record Prepared(Evaluation immediate, com.example.com.englishai.backend.application.llm.LlmRequest prompt, long messageCount) {}
    private Prepared prepare(UUID userId, UUID conversationId) {
        var conversation = conversations.findForUpdateByIdAndUserId(conversationId, userId)
                .orElseThrow(() -> new NoSuchElementException("Conversation not found"));
        var previous = evaluations.findByConversationId(conversationId);
        if (previous.isPresent()) return new Prepared(response(previous.get()), null, 0);
        conversation.requireActive();
        if (conversation.isResponseInProgress()) throw new IllegalStateException("Wait for the current response");
        long count = messages.countLinguisticUserMessages(conversationId);
        if (count < MIN_USER_MESSAGES)
            return new Prepared(new Evaluation(conversationId, Result.INSUFFICIENT, null, null, null, null, MIN_USER_MESSAGES, count), null, 0);

        var history = new HashMap<UUID, ConversationMessageEntity>();
        messages.findByConversationIdOrderByCreatedAtAscIdAsc(conversationId, PageRequest.of(0, OPENING_MESSAGES))
                .forEach(m -> history.put(m.getId(), m));
        messages.findByConversationIdOrderByCreatedAtDescIdDesc(conversationId, PageRequest.of(0, RECENT_MESSAGES))
                .forEach(m -> history.put(m.getId(), m));
        var ordered = history.values().stream().sorted(Comparator.comparing(ConversationMessageEntity::getCreatedAt)
                .thenComparing(ConversationMessageEntity::getId)).toList();
        return new Prepared(null, prompts.build(conversation, ordered), messages.countByConversationId(conversationId));
    }

    private Evaluation persist(UUID userId, UUID conversationId, long expectedMessages,
            int communication, int grammar, int vocabulary, int fluency, int relevance, int overall,
            Result result, List<String> strengths, List<String> improvements) {
        var conversation = conversations.findForUpdateByIdAndUserId(conversationId, userId)
                .orElseThrow(() -> new NoSuchElementException("Conversation not found"));
        var previous = evaluations.findByConversationId(conversationId);
        if (previous.isPresent()) return response(previous.get());
        conversation.requireActive();
        if (conversation.isResponseInProgress() || messages.countByConversationId(conversationId) != expectedMessages)
            throw new IllegalStateException("Conversation changed during evaluation");
        var now = OffsetDateTime.now(clock);
        var evaluation = new ConversationEvaluationEntity(UUID.randomUUID(), conversation, communication, grammar,
                vocabulary, fluency, relevance, overall, result, encode(strengths), encode(improvements), now);
        evaluations.saveAndFlush(evaluation);
        conversation.end(now);
        conversations.saveAndFlush(conversation);
        return response(evaluation);
    }

    private <T> T shortTransaction(Supplier<T> work) {
        return writes == null ? work.get() : writes.execute(ignored -> work.get());
    }

    @Transactional(readOnly = true)
    public Evaluation get(UUID userId, UUID conversationId) {
        conversations.findByIdAndUserId(conversationId, userId).orElseThrow(() -> new NoSuchElementException("Conversation not found"));
        return evaluations.findByConversationId(conversationId).map(this::response).orElse(null);
    }

    private Evaluation response(ConversationEvaluationEntity e) {
        try {
            return new Evaluation(e.getConversationId(), e.getResult(), new Scores(e.getCommunicationScore(), e.getGrammarScore(),
                    e.getVocabularyScore(), e.getFluencyScore(), e.getRelevanceScore(), e.getOverallScore()), feedback(JSON.readTree(e.getStrengths())),
                    feedback(JSON.readTree(e.getImprovements())), e.getEvaluatedAt(), null, null);
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) { throw invalid(); }
    }

    private JsonNode parse(String raw) {
        if (raw == null || raw.length() > 16000) throw invalid();
        String text = raw.strip();
        if (text.startsWith("```")) {
            int newline = text.indexOf('\n');
            if (newline < 0 || !Set.of("```", "```json").contains(text.substring(0, newline).strip()) || !text.endsWith("```")) throw invalid();
            text = text.substring(newline+1, text.length()-3).strip();
        }
        try {
            JsonNode node = JSON.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(text);
            if (node == null || !node.isObject()) throw invalid();
            return node;
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) { throw invalid(); }
    }
    private int score(JsonNode node, String key) {
        JsonNode value = node.path(key);
        if (!value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() < 0 || value.intValue() > 100) throw invalid();
        return value.intValue();
    }
    private List<String> feedback(JsonNode node) {
        if (!node.isArray() || node.size() > 3) throw invalid();
        var result = new ArrayList<String>();
        for (var item : node) {
            if (!item.isTextual() || item.textValue().isBlank() || item.textValue().length() > 500) throw invalid();
            result.add(item.textValue());
        }
        return List.copyOf(result);
    }
    private String encode(List<String> values) {
        try { return JSON.writeValueAsString(values); }
        catch (com.fasterxml.jackson.core.JsonProcessingException exception) { throw invalid(); }
    }
    private LlmProviderException invalid() { return new LlmProviderException("Invalid conversation evaluation response"); }
}
