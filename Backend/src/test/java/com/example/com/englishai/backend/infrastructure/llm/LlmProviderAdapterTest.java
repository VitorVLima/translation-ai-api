package com.example.com.englishai.backend.infrastructure.llm;

import com.example.com.englishai.backend.application.llm.LlmProviderException;
import com.example.com.englishai.backend.application.llm.LlmRequest;
import com.example.com.englishai.backend.application.llm.LlmResponseFormat;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import java.util.ArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LlmProviderAdapterTest {
    private HttpServer server;
    private AtomicReference<String> body;

    @BeforeEach void startServer() throws Exception {
        body = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = (exchange.getRequestURI().getPath().contains("generateContent") ? "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"gemini answer\"}]}}]}" : "{\"response\":\"ollama answer\"}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length); exchange.getResponseBody().write(response); exchange.close();
        });
        server.start();
    }
    @AfterEach void stopServer() { server.stop(0); }

    @Test void ollamaMapsRequestAndResponse() {
        var provider = new OllamaLlmProvider(baseUrl(), "llama", Duration.ofSeconds(1), Duration.ofSeconds(2));
        var response = provider.complete(new LlmRequest("system", "hello", null));
        assertThat(response.content()).isEqualTo("ollama answer");
        assertThat(body.get()).contains("llama").contains("hello").contains("system").contains("\"stream\":false");
        assertThat(body.get()).doesNotContain("\"format\":\"json\"");
    }
    @Test void ollamaRequestsJsonFormatOnlyWhenRequested() {
        var provider = new OllamaLlmProvider(baseUrl(), "llama", Duration.ofSeconds(1), Duration.ofSeconds(2));
        provider.complete(new LlmRequest("system", "hello", null, LlmResponseFormat.JSON));
        assertThat(body.get()).contains("\"format\":\"json\"");
    }
    @Test void ollamaStreamsChunksInOrderAndRequestsJsonFormat() throws Exception {
        server.removeContext("/");
        server.createContext("/", exchange -> {
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = ("{\"response\":\"{\\\"reply\\\":\\\"Hi\\\"}\"}\n" +
                    "{\"response\":\" there\"}\n" + "{\"response\":\"\" ,\"done\":true}\n").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length); exchange.getResponseBody().write(response); exchange.close();
        });
        var provider = new OllamaLlmProvider(baseUrl(), "llama", Duration.ofSeconds(1), Duration.ofSeconds(2));
        var chunks = new ArrayList<String>();
        provider.stream(new LlmRequest("system", "hello", null, LlmResponseFormat.JSON), chunks::add);
        assertThat(chunks).containsExactly("{\"reply\":\"Hi\"}", " there", "");
        assertThat(body.get()).contains("\"stream\":true").contains("\"format\":\"json\"");
    }
    @Test void geminiMapsRequestAndResponse() {
        var provider = new GeminiLlmProvider("secret-key", "gemini", baseUrl(), Duration.ofSeconds(1), Duration.ofSeconds(2));
        var response = provider.complete(new LlmRequest(null, "hello", null));
        assertThat(response.content()).isEqualTo("gemini answer");
        assertThat(body.get()).contains("hello");
        assertThat(provider.toString()).doesNotContain("secret-key");
    }
    @Test void nonSuccessfulResponsesBecomeProviderException() throws Exception {
        server.removeContext("/");
        server.createContext("/", exchange -> { exchange.sendResponseHeaders(503, -1); exchange.close(); });
        var provider = new OllamaLlmProvider(baseUrl(), "llama", Duration.ofSeconds(1), Duration.ofSeconds(2));
        assertThatThrownBy(() -> provider.complete(new LlmRequest(null, "hello", null)))
                .isInstanceOf(LlmProviderException.class);
    }
    @Test void malformedResponsesBecomeProviderException() throws Exception {
        server.removeContext("/");
        server.createContext("/", exchange -> {
            byte[] response = "not-json".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length); exchange.getResponseBody().write(response); exchange.close();
        });
        var provider = new OllamaLlmProvider(baseUrl(), "llama", Duration.ofSeconds(1), Duration.ofSeconds(2));
        assertThatThrownBy(() -> provider.complete(new LlmRequest(null, "hello", null)))
                .isInstanceOf(LlmProviderException.class);
    }

    @Test void invalidUnicodeEscapeBecomesProviderException() throws Exception {
        server.removeContext("/");
        server.createContext("/", exchange -> {
            byte[] response = "{\"response\":\"bad \\uZZZZ\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length); exchange.getResponseBody().write(response); exchange.close();
        });
        var provider = new OllamaLlmProvider(baseUrl(), "llama", Duration.ofSeconds(1), Duration.ofSeconds(2));
        assertThatThrownBy(() -> provider.complete(new LlmRequest(null, "hello", null)))
                .isInstanceOf(LlmProviderException.class);
    }
    private String baseUrl() { return "http://127.0.0.1:" + server.getAddress().getPort(); }
}

