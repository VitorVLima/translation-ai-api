package com.example.com.englishai.backend.infrastructure.llm;

import com.example.com.englishai.backend.application.llm.LlmRequest;
import com.example.com.englishai.backend.application.llm.LlmResponse;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class LlmModelSafetyTest {
    @Test void requestAndResponseToStringDoNotExposeContent() {
        assertThat(new LlmRequest("private system", "private prompt", 0.2).toString()).doesNotContain("private");
        assertThat(new LlmResponse("private response").toString()).doesNotContain("private response");
    }
}
