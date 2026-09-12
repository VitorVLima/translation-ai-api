package com.example.com.englishai.backend.application.ports;

import com.example.com.englishai.backend.application.llm.LlmRequest;
import com.example.com.englishai.backend.application.llm.LlmResponse;

public interface LlmProvider {
    LlmResponse complete(LlmRequest request);
}
