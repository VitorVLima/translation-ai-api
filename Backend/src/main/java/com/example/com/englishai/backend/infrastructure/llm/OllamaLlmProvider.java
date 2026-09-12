package com.example.com.englishai.backend.infrastructure.llm;

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
        String prompt = (request.systemPrompt() == null || request.systemPrompt().isBlank() ? "" : request.systemPrompt() + "\n\n") + request.userPrompt();
        String format = request.responseFormat() == LlmResponseFormat.JSON ? ",\"format\":\"json\"" : "";
        String json = "{\"model\":" + LlmJson.quote(model) + ",\"prompt\":" + LlmJson.quote(prompt) + ",\"stream\":false" + format + (request.temperature() == null ? "" : ",\"options\":{\"temperature\":" + request.temperature() + "}") + "}";
        return new LlmResponse(LlmJson.stringField(http.post(URI.create(baseUrl + "/api/generate"), json), "response"));
    }
    @Override public void stream(LlmRequest request, java.util.function.Consumer<String> onChunk) {
        String prompt = (request.systemPrompt() == null || request.systemPrompt().isBlank() ? "" : request.systemPrompt() + "\n\n") + request.userPrompt();
        String format = request.responseFormat() == com.example.com.englishai.backend.application.llm.LlmResponseFormat.JSON ? ",\"format\":\"json\"" : "";
        String json = "{\"model\":" + LlmJson.quote(model) + ",\"prompt\":" + LlmJson.quote(prompt) + ",\"stream\":true" + format + (request.temperature() == null ? "" : ",\"options\":{\"temperature\":" + request.temperature() + "}") + "}";
        http.stream(URI.create(baseUrl + "/api/generate"), json, line -> onChunk.accept(LlmJson.stringField(line, "response")));
    }
}
