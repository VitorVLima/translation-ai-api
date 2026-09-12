package com.example.com.englishai.backend.application.ports;

import com.example.com.englishai.backend.application.llm.LlmRequest;
import java.util.function.Consumer;

public interface LlmStreamingProvider {
    void stream(LlmRequest request, Consumer<String> onChunk);
}
