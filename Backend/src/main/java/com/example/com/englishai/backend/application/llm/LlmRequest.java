package com.example.com.englishai.backend.application.llm;

public record LlmRequest(String systemPrompt, String userPrompt, Double temperature, LlmResponseFormat responseFormat) {
    public LlmRequest(String systemPrompt, String userPrompt, Double temperature) {
        this(systemPrompt, userPrompt, temperature, LlmResponseFormat.TEXT);
    }

    public LlmRequest {
        if (userPrompt == null || userPrompt.isBlank()) throw new IllegalArgumentException("userPrompt is required");
        if (temperature != null && (temperature.isNaN() || temperature.isInfinite() || temperature < 0))
            throw new IllegalArgumentException("temperature must be non-negative");
        if (responseFormat == null) throw new IllegalArgumentException("responseFormat is required");
    }

    @Override
    public String toString() {
        return "LlmRequest[systemPrompt=[REDACTED], userPrompt=[REDACTED], temperature=" + temperature + ", responseFormat=" + responseFormat + "]";
    }
}
