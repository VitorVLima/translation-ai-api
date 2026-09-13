package com.example.com.englishai.backend.infrastructure.llm;

import com.example.com.englishai.backend.infrastructure.metrics.AiMetrics;

import com.example.com.englishai.backend.application.llm.*;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.application.ports.LlmStreamingProvider;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;

public final class GeminiLlmProvider implements LlmProvider, LlmStreamingProvider {
    private final HttpLlmClient http; private final String endpoint; private final String model;
    public GeminiLlmProvider(String apiKey, String model, Duration connectTimeout, Duration responseTimeout) {
        this(apiKey, model, "https://generativelanguage.googleapis.com", connectTimeout, responseTimeout);
    }
    GeminiLlmProvider(String apiKey, String model, String apiBaseUrl, Duration connectTimeout, Duration responseTimeout) {
        if (apiKey == null || apiKey.isBlank() || model == null || model.isBlank()) throw new IllegalArgumentException("Gemini API key and model are required");
        if (apiBaseUrl == null || apiBaseUrl.isBlank()) throw new IllegalArgumentException("Gemini API endpoint is required");
        this.model = model;
        String encodedModel = java.net.URLEncoder.encode(model, java.nio.charset.StandardCharsets.UTF_8).replace("+", "%20");
        String encodedKey = java.net.URLEncoder.encode(apiKey, java.nio.charset.StandardCharsets.UTF_8);
        this.endpoint = apiBaseUrl.replaceAll("/+$", "") + "/v1beta/models/" + encodedModel + ":generateContent?key=" + encodedKey;
        this.http = new HttpLlmClient(HttpClient.newBuilder().connectTimeout(connectTimeout).build(), responseTimeout);
    }
    @Override public LlmResponse complete(LlmRequest request) {
        return AiMetrics.measure(AiMetrics.Operation.LLM_COMPLETE, AiMetrics.Provider.GEMINI, () -> completeMeasured(request));
    }
    private LlmResponse completeMeasured(LlmRequest request) {
        String text = (request.systemPrompt() == null || request.systemPrompt().isBlank() ? "" : request.systemPrompt() + "\n\n") + request.userPrompt();
        String json = "{\"contents\":[{\"parts\":[{\"text\":" + LlmJson.quote(text) + "}]}]}";
        return new LlmResponse(LlmJson.stringField(http.post(URI.create(endpoint), json), "text"));
    }
    @Override public void stream(LlmRequest request, java.util.function.Consumer<String> onChunk) {
        try (var metric = AiMetrics.start(AiMetrics.Operation.LLM_STREAM_TOTAL, AiMetrics.Provider.GEMINI)) {
            streamMeasured(request, chunk -> {
                if (chunk != null && !chunk.isEmpty()) metric.first(AiMetrics.Operation.LLM_FIRST_CHUNK);
                onChunk.accept(chunk);
            });
            metric.success();
        }
    }
    private void streamMeasured(LlmRequest request, java.util.function.Consumer<String> onChunk) {
        String text = (request.systemPrompt() == null || request.systemPrompt().isBlank() ? "" : request.systemPrompt() + "\n\n") + request.userPrompt();
        String json = "{\"contents\":[{\"parts\":[{\"text\":" + LlmJson.quote(text) + "}]}]}";
        String streamEndpoint = endpoint.replace(":generateContent?key=", ":streamGenerateContent?alt=sse&key=");
        http.stream(URI.create(streamEndpoint), json, line -> {
            String payload = line.startsWith("data:") ? line.substring(5).trim() : line.trim();
            if (!payload.isEmpty() && !payload.equals("[DONE]")) onChunk.accept(LlmJson.stringField(payload, "text"));
        });
    }
    @Override public String toString() { return "GeminiLlmProvider[configured=true]"; }
}
