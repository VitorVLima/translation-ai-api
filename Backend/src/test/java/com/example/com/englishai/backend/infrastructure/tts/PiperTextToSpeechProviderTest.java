package com.example.com.englishai.backend.infrastructure.tts;

import com.example.com.englishai.backend.application.tts.*;
import com.example.com.englishai.backend.application.translation.Language;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class PiperTextToSpeechProviderTest {
    @Test void adapterForwardsNeutralSettingsAndReadsSafeVoiceMetadata() throws Exception {
        var body = new AtomicReference<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/synthesize", exchange -> {
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.getResponseHeaders().add("Content-Type", "audio/wav");
            exchange.sendResponseHeaders(200, 4);
            exchange.getResponseBody().write(new byte[]{1,2,3,4});
            exchange.close();
        });
        server.createContext("/voices", exchange -> {
            byte[] result = "[{\"key\":\"en_US-lessac-high\",\"displayName\":\"Lessac High\",\"language\":\"en\"}]".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, result.length);
            exchange.getResponseBody().write(result);
            exchange.close();
        });
        server.start();
        try {
            var provider = new PiperTextToSpeechProvider("http://127.0.0.1:" + server.getAddress().getPort(), Duration.ofSeconds(1), Duration.ofSeconds(2));
            assertThat(provider.voices()).containsExactly(new TtsVoice("en_US-lessac-high", "Lessac High", "en"));
            var result = provider.synthesize(new TextToSpeechRequest("Hello", Language.ENGLISH, new SpeechSettings("en_US-lessac-high", 1.15)));
            assertThat(result.audio()).hasSize(4);
            var json = new JsonMapper().readTree(body.get());
            assertThat(json.get("voice").asText()).isEqualTo("en_US-lessac-high");
            assertThat(json.get("speechRate").asDouble()).isEqualTo(1.15);
            assertThat(json.has("length_scale")).isFalse();
            provider.synthesize(new TextToSpeechRequest("Olá", Language.PORTUGUESE));
            json = new JsonMapper().readTree(body.get());
            assertThat(json.get("voice").isNull()).isTrue();
            assertThat(json.get("speechRate").asDouble()).isEqualTo(1.0);
        } finally { server.stop(0); }
    }
}
