package com.example.com.englishai.backend.infrastructure.llm;

import com.example.com.englishai.backend.application.llm.LlmProviderException;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

final class HttpLlmClient {
    private final HttpClient client;
    private final Duration responseTimeout;
    HttpLlmClient(HttpClient client, Duration responseTimeout) { this.client = client; this.responseTimeout = responseTimeout; }

    String post(URI uri, String json) {
        try {
            var request = HttpRequest.newBuilder(uri).timeout(responseTimeout)
                    .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(json)).build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300)
                throw new LlmProviderException("LLM provider request failed");
            return response.body();
        } catch (LlmProviderException e) { throw e; }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new LlmProviderException("LLM provider request interrupted"); }
        catch (IOException | RuntimeException e) { throw new LlmProviderException("LLM provider request failed"); }
    }
    void stream(URI uri, String json, java.util.function.Consumer<String> onLine) {
        try {
            var request = HttpRequest.newBuilder(uri).timeout(responseTimeout)
                    .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(json)).build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofLines());
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new LlmProviderException("LLM provider request failed");
            response.body().forEach(onLine);
        } catch (LlmProviderException e) { throw e; }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new LlmProviderException("LLM provider request interrupted"); }
        catch (IOException | RuntimeException e) { throw new LlmProviderException("LLM provider request failed"); }
    }
}
