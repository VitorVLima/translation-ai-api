package com.example.com.englishai.backend.infrastructure.llm;

import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.application.translation.TranslateText;
import com.example.com.englishai.backend.application.translation.CorrectText;
import com.example.com.englishai.backend.application.translation.ExplainCorrection;
import com.example.com.englishai.backend.application.chat.ChatWithTutor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class TranslationConfig {
    @Bean
    public TranslateText translateText(LlmProvider provider,
                                       @Value("${ai.translation.max-characters:5000}") int maxCharacters) {
        if (maxCharacters <= 0) throw new IllegalArgumentException("AI_TRANSLATION_MAX_CHARACTERS must be positive");
        return new TranslateText(provider, maxCharacters);
    }

    @Bean
    public CorrectText correctText(LlmProvider provider,
                                   @Value("${ai.translation.max-characters:5000}") int maxCharacters) {
        if (maxCharacters <= 0) throw new IllegalArgumentException("AI_TRANSLATION_MAX_CHARACTERS must be positive");
        return new CorrectText(provider, maxCharacters);
    }

    @Bean
    public ExplainCorrection explainCorrection(LlmProvider provider,
                                               @Value("${ai.translation.max-characters:5000}") int maxCharacters) {
        if (maxCharacters <= 0) throw new IllegalArgumentException("AI_TRANSLATION_MAX_CHARACTERS must be positive");
        return new ExplainCorrection(provider, maxCharacters);
    }

    @Bean
    public ChatWithTutor chatWithTutor(LlmProvider provider,
                                       @Value("${ai.translation.max-characters:5000}") int maxCharacters) {
        if (maxCharacters <= 0) throw new IllegalArgumentException("AI_TRANSLATION_MAX_CHARACTERS must be positive");
        return new ChatWithTutor(provider, maxCharacters);
    }
}
