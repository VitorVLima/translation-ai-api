package com.example.com.englishai.backend.infrastructure.llm;

import com.example.com.englishai.backend.application.ports.LlmProvider;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class LlmProviderConfig {
    @Bean
    public LlmProvider llmProvider(
            @Value("${ai.llm.provider:ollama}") String provider,
            @Value("${ai.llm.ollama.base-url:http://localhost:11434}") String ollamaBaseUrl,
            @Value("${ai.llm.ollama.model:}") String ollamaModel,
            @Value("${ai.llm.gemini.api-key:}") String geminiApiKey,
            @Value("${ai.llm.gemini.model:}") String geminiModel,
            @Value("${ai.llm.connect-timeout-seconds:5}") long connectTimeoutSeconds,
            @Value("${ai.llm.response-timeout-seconds:120}") long responseTimeoutSeconds) {
        if (connectTimeoutSeconds <= 0 || responseTimeoutSeconds <= 0) {
            throw new IllegalArgumentException("LLM timeouts must be positive");
        }
        return createProvider(provider, ollamaBaseUrl, ollamaModel, geminiApiKey, geminiModel,
                Duration.ofSeconds(connectTimeoutSeconds), Duration.ofSeconds(responseTimeoutSeconds));
    }

    LlmProvider createProvider(String provider, String ollamaBaseUrl, String ollamaModel,
                               String geminiApiKey, String geminiModel,
                               Duration connectTimeout, Duration responseTimeout) {
        if (provider == null) throw new IllegalArgumentException("LLM_PROVIDER is required");
        return switch (provider.trim().toLowerCase(java.util.Locale.ROOT)) {
            case "ollama" -> new OllamaLlmProvider(ollamaBaseUrl, ollamaModel, connectTimeout, responseTimeout);
            case "gemini" -> new GeminiLlmProvider(geminiApiKey, geminiModel, connectTimeout, responseTimeout);
            default -> throw new IllegalArgumentException("Unsupported LLM_PROVIDER");
        };
    }
}
