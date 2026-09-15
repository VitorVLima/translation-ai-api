package com.example.com.englishai.backend.application.llm;

public record LlmRequest(String systemPrompt, String userPrompt, Double temperature, LlmResponseFormat responseFormat,
                         java.util.List<com.example.com.englishai.backend.application.chat.ChatHistoryMessage> history) {
    public LlmRequest(String systemPrompt, String userPrompt, Double temperature, LlmResponseFormat responseFormat) {
        this(systemPrompt, userPrompt, temperature, responseFormat, null);
    }
    public LlmRequest(String systemPrompt, String userPrompt, Double temperature) {
        this(systemPrompt, userPrompt, temperature, LlmResponseFormat.TEXT);
    }

    public LlmRequest {
        if (history != null) {
            history = java.util.List.copyOf(history);
            for (var message : history) {
                if (message.role() == null || message.content() == null || message.content().isBlank())
                    throw new IllegalArgumentException("invalid LLM history");
            }
        }
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
