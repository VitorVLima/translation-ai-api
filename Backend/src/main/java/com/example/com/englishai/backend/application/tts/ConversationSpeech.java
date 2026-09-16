package com.example.com.englishai.backend.application.tts;

import com.example.com.englishai.backend.application.conversation.ConversationService;
import com.example.com.englishai.backend.application.translation.Language;
import com.example.com.englishai.backend.infrastructure.persistence.repository.ScenarioDefinitionJpaRepository;
import org.springframework.stereotype.Service;
import java.util.UUID;

@Service
public class ConversationSpeech {
    private final ConversationService conversations;
    private final ScenarioDefinitionJpaRepository scenarios;
    private final SynthesizeSpeech speech;

    public ConversationSpeech(ConversationService conversations, ScenarioDefinitionJpaRepository scenarios, SynthesizeSpeech speech) {
        this.conversations = conversations;
        this.scenarios = scenarios;
        this.speech = speech;
    }

    public SynthesizeSpeechResult execute(UUID owner, UUID conversationId, String text) {
        var conversation = conversations.require(owner, conversationId);
        var scenario = scenarios.findByScenarioKey(conversation.getScenarioKey()).orElseThrow();
        // Existing conversations intentionally use the current scenario, including disabled catalog entries.
        return speech.execute(new SynthesizeSpeechCommand(text, Language.fromCode(conversation.getLanguage())),
                new SpeechSettings(scenario.getTtsVoice(), scenario.getSpeechRate()));
    }
}
