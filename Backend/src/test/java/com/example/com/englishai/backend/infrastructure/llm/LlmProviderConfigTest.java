package com.example.com.englishai.backend.infrastructure.llm;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LlmProviderConfigTest {
    private final LlmProviderConfig config = new LlmProviderConfig();
    private final Duration timeout = Duration.ofSeconds(1);

    @Test void selectsOllama() {
        assertThat(config.createProvider("ollama", "http://localhost:11434", "model", "", "", timeout, timeout))
                .isInstanceOf(OllamaLlmProvider.class);
    }
    @Test void selectsGemini() {
        assertThat(config.createProvider("gemini", "", "", "test-key", "model", timeout, timeout))
                .isInstanceOf(GeminiLlmProvider.class);
    }
    @Test void rejectsUnknownProvider() {
        assertThatThrownBy(() -> config.createProvider("other", "", "", "", "", timeout, timeout))
                .isInstanceOf(IllegalArgumentException.class).hasMessage("Unsupported LLM_PROVIDER");
    }
    @Test void rejectsMissingProviderConfiguration() {
        assertThatThrownBy(() -> config.createProvider("ollama", "http://localhost:11434", "", "", "", timeout, timeout))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> config.createProvider("gemini", "", "", "", "model", timeout, timeout))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
