package com.example.com.englishai.backend.infrastructure.llm;

import com.example.com.englishai.backend.application.llm.*;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;

public final class GeminiLlmProvider implements LlmProvider {
    private final HttpLlmClient http; private final String endpoint; private final String model;
    public GeminiLlmProvider(String apiKey, String model, Duration connectTimeout, Duration responseTimeout) {
        this(apiKey, model, "https://generativelanguage.googleapis.com", connectTimeout, responseTimeout);
    }
    GeminiLlmProvider(String apiKey, String model, String apiBaseUrl, Duration connectTimeout, Duration responseTimeout) {
        if (apiKey == null || apiKey.isBlank() || model == null || model.isBlank()) throw new IllegalArgumentException("Gemini API key and model are required");
        if (apiBaseUrl == null || apiBaseUrl.isBlank()) throw new IllegalArgumentException("Gemini API endpoint is required");
        this.model = model;
        this.endpoint = apiBaseUrl.replaceAll("/+$", "") + "/v1beta/models/" + model + ":generateContent?key=" + apiKey;
        this.http = new HttpLlmClient(HttpClient.newBuilder().connectTimeout(connectTimeout).build(), responseTimeout);
    }
    @Override public LlmResponse complete(LlmRequest request) {
        String text = (request.systemPrompt() == null || request.systemPrompt().isBlank() ? "" : request.systemPrompt() + "\n\n") + request.userPrompt();
        String json = "{\"contents\":[{\"parts\":[{\"text\":" + LlmJson.quote(text) + "}]}]}";
        return new LlmResponse(LlmJson.stringField(http.post(URI.create(endpoint), json), "text"));
    }
    @Override public String toString() { return "GeminiLlmProvider[configured=true]"; }
}
