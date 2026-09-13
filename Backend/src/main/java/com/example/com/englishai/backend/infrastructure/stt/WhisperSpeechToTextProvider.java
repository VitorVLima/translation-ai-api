package com.example.com.englishai.backend.infrastructure.stt;

import com.example.com.englishai.backend.infrastructure.metrics.AiMetrics;

import com.example.com.englishai.backend.application.ports.SpeechToTextProvider;
import com.example.com.englishai.backend.application.stt.SpeechToTextProviderException;
import com.example.com.englishai.backend.application.stt.SpeechToTextRequest;
import com.example.com.englishai.backend.application.stt.SpeechToTextResult;
import com.example.com.englishai.backend.application.translation.Language;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;

public class WhisperSpeechToTextProvider implements SpeechToTextProvider {
    private static final System.Logger LOGGER = System.getLogger(WhisperSpeechToTextProvider.class.getName());
    private final String endpoint;
    private final HttpClient client;
    private final Duration responseTimeout;

    public WhisperSpeechToTextProvider(String baseUrl, Duration connectTimeout, Duration responseTimeout) {
        if (baseUrl == null || baseUrl.isBlank()) throw new IllegalArgumentException("WHISPER_BASE_URL is required");
        if (connectTimeout == null || responseTimeout == null || connectTimeout.isZero() || connectTimeout.isNegative()
                || responseTimeout.isZero() || responseTimeout.isNegative()) throw new IllegalArgumentException("STT timeouts must be positive");
        this.endpoint = baseUrl.replaceAll("/+$", "") + "/transcribe";
        this.client = HttpClient.newBuilder().connectTimeout(connectTimeout).build();
        this.responseTimeout = responseTimeout;
    }

    @Override
    public SpeechToTextResult transcribe(SpeechToTextRequest request) {
        return AiMetrics.measure(AiMetrics.Operation.STT, AiMetrics.Provider.WHISPER, () -> transcribeMeasured(request));
    }
    private SpeechToTextResult transcribeMeasured(SpeechToTextRequest request) {
        String boundary = "----EnglishAi" + UUID.randomUUID();
        try {
            byte[] body = multipart(request, boundary);
            HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(endpoint))
                    .version(HttpClient.Version.HTTP_1_1)
                    .timeout(responseTimeout)
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
            HttpResponse<String> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                if (response.statusCode() == 422) LOGGER.log(System.Logger.Level.WARNING, "WHISPER_UPSTREAM_VALIDATION_REJECTED status=422");
                throw new SpeechToTextProviderException("Whisper service request failed");
            }
            String text = stringField(response.body(), "text");
            String languageCode = stringField(response.body(), "language");
            if (text == null || text.isBlank() || languageCode == null || languageCode.isBlank()) throw new SpeechToTextProviderException("Whisper service response was invalid");
            Language language;
            try { language = Language.fromCode(languageCode); } catch (IllegalArgumentException e) { throw new SpeechToTextProviderException("Whisper service response was invalid", e); }
            return new SpeechToTextResult(text, language);
        } catch (SpeechToTextProviderException e) { throw e;
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new SpeechToTextProviderException("Whisper service request interrupted", e);
        } catch (IOException | RuntimeException e) { throw new SpeechToTextProviderException("Whisper service request failed", e); }
    }

    private byte[] multipart(SpeechToTextRequest request, String boundary) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        String filename = request.filename() == null || request.filename().isBlank() ? "audio" : request.filename().replaceAll(".*[\\\\/]", "").replaceAll("[\"\r\n]", "_");
        String contentType = request.contentType() == null || request.contentType().isBlank() ? "application/octet-stream" : request.contentType();
        write(out, "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"\r\nContent-Type: " + contentType + "\r\n\r\n");
        out.write(request.audio()); write(out, "\r\n");
        if (request.language() != null) {
            write(out, "--" + boundary + "\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\n" + request.language().code() + "\r\n");
        }
        write(out, "--" + boundary + "--\r\n");
        return out.toByteArray();
    }
    private static void write(ByteArrayOutputStream out, String value) throws IOException { out.write(value.getBytes(StandardCharsets.UTF_8)); }

    private static String stringField(String json, String field) {
        if (json == null || json.isBlank()) throw new SpeechToTextProviderException("Whisper service response was invalid");
        String key = "\"" + field + "\"";
        int keyAt = json.indexOf(key);
        if (keyAt < 0) throw new SpeechToTextProviderException("Whisper service response was invalid");
        int colon = json.indexOf(':', keyAt + key.length());
        if (colon < 0) throw new SpeechToTextProviderException("Whisper service response was invalid");
        int start = colon + 1;
        while (start < json.length() && Character.isWhitespace(json.charAt(start))) start++;
        if (start >= json.length() || json.charAt(start) != '\"') throw new SpeechToTextProviderException("Whisper service response was invalid");
        StringBuilder value = new StringBuilder(); boolean escaped = false;
        for (int i = start + 1; i < json.length(); i++) {
            char c = json.charAt(i);
            if (escaped) { switch (c) { case 'n' -> value.append('\n'); case 'r' -> value.append('\r'); case 't' -> value.append('\t'); case '"', '\\', '/' -> value.append(c); default -> value.append(c); } escaped = false; }
            else if (c == '\\') escaped = true;
            else if (c == '\"') return value.toString();
            else value.append(c);
        }
        throw new SpeechToTextProviderException("Whisper service response was invalid");
    }
}
