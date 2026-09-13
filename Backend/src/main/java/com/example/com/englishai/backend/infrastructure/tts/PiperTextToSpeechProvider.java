package com.example.com.englishai.backend.infrastructure.tts;

import com.example.com.englishai.backend.infrastructure.metrics.AiMetrics;

import com.example.com.englishai.backend.application.ports.TextToSpeechProvider;
import com.example.com.englishai.backend.application.tts.TextToSpeechProviderException;
import com.example.com.englishai.backend.application.tts.TextToSpeechRequest;
import com.example.com.englishai.backend.application.tts.TextToSpeechResult;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

public class PiperTextToSpeechProvider implements TextToSpeechProvider {
    private final String endpoint;
    private final HttpClient client;
    private final Duration responseTimeout;

    public PiperTextToSpeechProvider(String baseUrl, Duration connectTimeout, Duration responseTimeout) {
        if (baseUrl == null || baseUrl.isBlank()) throw new IllegalArgumentException("PIPER_BASE_URL is required");
        if (connectTimeout == null || responseTimeout == null || connectTimeout.isNegative() || connectTimeout.isZero() || responseTimeout.isNegative() || responseTimeout.isZero())
            throw new IllegalArgumentException("TTS timeouts must be positive");
        endpoint = baseUrl.replaceAll("/+$", "") + "/synthesize";
        client = HttpClient.newBuilder().connectTimeout(connectTimeout).build();
        this.responseTimeout = responseTimeout;
    }

    @Override
    public TextToSpeechResult synthesize(TextToSpeechRequest request) {
        return AiMetrics.measure(AiMetrics.Operation.TTS, AiMetrics.Provider.PIPER, () -> synthesizeMeasured(request));
    }
    private TextToSpeechResult synthesizeMeasured(TextToSpeechRequest request) {
        try {
            HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(endpoint))
                    .version(HttpClient.Version.HTTP_1_1).timeout(responseTimeout)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json(request), StandardCharsets.UTF_8)).build();
            HttpResponse<byte[]> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofByteArray());
            String contentType = response.headers().firstValue("Content-Type").orElse("");
            if (response.statusCode() < 200 || response.statusCode() >= 300 || response.body() == null || response.body().length == 0 || !contentType.toLowerCase(java.util.Locale.ROOT).startsWith("audio/wav"))
                throw new TextToSpeechProviderException("Piper service returned an invalid response");
            return new TextToSpeechResult(response.body(), "audio/wav");
        } catch (TextToSpeechProviderException e) { throw e;
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new TextToSpeechProviderException("Piper service request interrupted", e);
        } catch (IOException | RuntimeException e) { throw new TextToSpeechProviderException("Piper service request failed", e); }
    }

    private static String json(TextToSpeechRequest request) {
        return "{\"text\":" + quote(request.text()) + ",\"language\":\"" + request.language().code() + "\"}";
    }
    private static String quote(String value) { return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t") + "\""; }
}
