package com.example.com.englishai.backend.infrastructure.llm;

import com.example.com.englishai.backend.infrastructure.metrics.AiMetrics;

import com.example.com.englishai.backend.application.llm.*;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.application.ports.LlmStreamingProvider;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;

public final class OllamaLlmProvider implements LlmProvider, LlmStreamingProvider {
    private final HttpLlmClient http; private final String baseUrl; private final String model;
    public OllamaLlmProvider(String baseUrl, String model, Duration connectTimeout, Duration responseTimeout) {
        if (baseUrl == null || baseUrl.isBlank() || model == null || model.isBlank()) throw new IllegalArgumentException("Ollama base URL and model are required");
        this.baseUrl = baseUrl.replaceAll("/+$", ""); this.model = model;
        this.http = new HttpLlmClient(HttpClient.newBuilder().connectTimeout(connectTimeout).build(), responseTimeout);
    }
    @Override public LlmResponse complete(LlmRequest request) {
        return AiMetrics.measure(AiMetrics.Operation.LLM_COMPLETE, AiMetrics.Provider.OLLAMA, () -> completeMeasured(request));
    }
    private LlmResponse completeMeasured(LlmRequest request) {
        String response = http.post(URI.create(baseUrl + (request.history() == null ? "/api/generate" : "/api/chat")), payload(request, false));
        return new LlmResponse(LlmJson.stringField(response, request.history() == null ? "response" : "content"));
    }
    @Override public void stream(LlmRequest request, java.util.function.Consumer<String> onChunk) {
        try (var metric = AiMetrics.start(AiMetrics.Operation.LLM_STREAM_TOTAL, AiMetrics.Provider.OLLAMA)) {
            streamMeasured(request, chunk -> {
                if (chunk != null && !chunk.isEmpty()) metric.first(AiMetrics.Operation.LLM_FIRST_CHUNK);
                onChunk.accept(chunk);
            });
            metric.success();
        }
    }
    private void streamMeasured(LlmRequest request, java.util.function.Consumer<String> onChunk) {
        http.stream(URI.create(baseUrl + (request.history() == null ? "/api/generate" : "/api/chat")), payload(request, true),
                line -> onChunk.accept(LlmJson.stringField(line, request.history() == null ? "response" : "content")));
    }
    private String payload(LlmRequest request, boolean stream) {
        String input;
        if (request.history() == null) {
            input = "\"prompt\":" + LlmJson.quote(request.userPrompt())
                    + (request.systemPrompt() == null ? "" : ",\"system\":" + LlmJson.quote(request.systemPrompt()));
        } else {
            var messages = new java.util.ArrayList<String>();
            if (request.systemPrompt() != null && !request.systemPrompt().isBlank())
                messages.add(message("system", request.systemPrompt()));
            for (var message : request.history()) messages.add(message(message.role().code(), message.content()));
            messages.add(message("user", request.userPrompt()));
            input = "\"messages\":[" + String.join(",", messages) + "]";
        }
        return "{\"model\":" + LlmJson.quote(model) + "," + input + ",\"stream\":" + stream
                + (request.responseFormat() == LlmResponseFormat.JSON ? ",\"format\":\"json\"" : "")
                + (request.temperature() == null ? "" : ",\"options\":{\"temperature\":" + request.temperature() + "}") + "}";
    }

    private String message(String role, String content) {
        return "{\"role\":" + LlmJson.quote(role) + ",\"content\":" + LlmJson.quote(content) + "}";
    }

}
