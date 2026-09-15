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
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void structuredConversationUsesNativeRolesForEitherProvider(boolean gemini) throws Exception {
        server.removeContext("/");
        var path = new AtomicReference<String>();
        server.createContext("/", exchange -> {
            path.set(exchange.getRequestURI().getPath());
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = (gemini
                    ? "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"answer\"}]}}]}"
                    : "{\"message\":{\"role\":\"assistant\",\"content\":\"answer\"}}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length); exchange.getResponseBody().write(response); exchange.close();
        });
        com.example.com.englishai.backend.application.ports.LlmProvider provider = gemini
                ? new GeminiLlmProvider("test-key", "gemini", baseUrl(), Duration.ofSeconds(1), Duration.ofSeconds(2))
                : new OllamaLlmProvider(baseUrl(), "llama", Duration.ofSeconds(1), Duration.ofSeconds(2));
        var request = structuredRequest();
        assertThat(provider.complete(request).content()).isEqualTo("answer");
        assertNativeRoles(body.get(), gemini);
        assertThat(path.get()).contains(gemini ? "generateContent" : "/api/chat");
        var chunks = new ArrayList<String>();
        ((com.example.com.englishai.backend.application.ports.LlmStreamingProvider) provider).stream(request,chunks::add);
        assertThat(chunks).containsExactly("answer");
        assertNativeRoles(body.get(), gemini);
        assertThat(path.get()).contains(gemini ? "streamGenerateContent" : "/api/chat");
        provider.complete(new LlmRequest("opening-system", "Begin the configured conversation.", null,
                LlmResponseFormat.JSON, java.util.List.of()));
        assertThat(body.get()).contains("opening-system", "Begin the configured conversation.")
                .doesNotContain("historic-assistant");
    }

    private LlmRequest structuredRequest() {
        return new LlmRequest("trusted-system", "current-user", 0.2, LlmResponseFormat.JSON, java.util.List.of(
                new com.example.com.englishai.backend.application.chat.ChatHistoryMessage(
                        com.example.com.englishai.backend.application.chat.ChatRole.USER,"historic-user"),
                new com.example.com.englishai.backend.application.chat.ChatHistoryMessage(
                        com.example.com.englishai.backend.application.chat.ChatRole.ASSISTANT,"historic-assistant")));
    }

    private void assertNativeRoles(String json, boolean gemini) {
        if (gemini) {
            assertThat(json).contains("\"systemInstruction\":{\"parts\":[{\"text\":\"trusted-system\"}]}",
                    "\"role\":\"user\",\"parts\":[{\"text\":\"historic-user\"}]",
                    "\"role\":\"model\",\"parts\":[{\"text\":\"historic-assistant\"}]",
                    "\"responseMimeType\":\"application/json\"");
        } else {
            assertThat(json).contains("\"role\":\"system\",\"content\":\"trusted-system\"",
                    "\"role\":\"user\",\"content\":\"historic-user\"",
                    "\"role\":\"assistant\",\"content\":\"historic-assistant\"");
        }
        assertThat(json.indexOf("historic-user")).isLessThan(json.indexOf("historic-assistant"));
        assertThat(json.indexOf("historic-assistant")).isLessThan(json.indexOf("current-user"));
    }

    private String baseUrl() { return "http://127.0.0.1:" + server.getAddress().getPort(); }
}

