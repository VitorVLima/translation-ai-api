package com.example.com.englishai.backend.application.llm;

public record LlmResponse(String content) {
    public LlmResponse {
        if (content == null) throw new IllegalArgumentException("content is required");
    }

    @Override
    public String toString() {
        return "LlmResponse[content=[REDACTED]]";
    }
}
