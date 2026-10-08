package com.example.com.englishai.backend.infrastructure.stt;

import com.example.com.englishai.backend.application.stt.SpeechToTextRequest;
import com.example.com.englishai.backend.application.translation.Language;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class WhisperSpeechToTextProviderTest {
    @Test void multipartPreservesAudioBytesWithoutBuildingAnotherWholeBodyArray() throws Exception {
        var captured = new AtomicReference<byte[]>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/transcribe", exchange -> {
            captured.set(exchange.getRequestBody().readAllBytes());
            byte[] answer = "{\"text\":\"hello\",\"language\":\"en\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, answer.length);
            exchange.getResponseBody().write(answer);
            exchange.close();
        });
        server.start();
        try {
            var provider = new WhisperSpeechToTextProvider("http://127.0.0.1:" + server.getAddress().getPort(),
                    Duration.ofSeconds(1), Duration.ofSeconds(2));
            byte[] audio = {0, 1, 2, -1, 3};
            var result = provider.transcribe(new SpeechToTextRequest(audio, "sample.wav", "audio/wav", Language.ENGLISH));
            assertThat(result.text()).isEqualTo("hello");
            var body = captured.get();
            assertThat(new String(body, StandardCharsets.ISO_8859_1)).contains("filename=\"sample.wav\"")
                    .contains("name=\"language\"");
            assertThat(body).containsSequence(audio);
        } finally { server.stop(0); }
    }
}
