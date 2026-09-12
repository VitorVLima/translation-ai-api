package com.example.com.englishai.backend.presentation.rest.chat;

import com.example.com.englishai.backend.application.chat.*;
import com.example.com.englishai.backend.application.translation.Language;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/chat")
public class ConversationController {
    private final ChatWithTutor chatWithTutor;
    public ConversationController(ChatWithTutor chatWithTutor) { this.chatWithTutor = chatWithTutor; }
    @PostMapping
    public ResponseEntity<ChatResponse> chat(@Valid @RequestBody ChatRequest request) {
        var result = chatWithTutor.execute(toCommand(request));
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(new ChatResponse(result.reply(), result.hasCorrection(), result.correctedText()));
    }
    @PostMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Valid @RequestBody ChatRequest request) {
        var command = toCommand(request);
        chatWithTutor.validateRequest(command);
        if (!chatWithTutor.streamingAvailable()) throw new com.example.com.englishai.backend.application.llm.LlmProviderException("Streaming is not supported by the configured provider");
        var emitter = new SseEmitter(130_000L);
        CompletableFuture.runAsync(() -> {
            try {
                var result = chatWithTutor.stream(command, chunk -> send(emitter, "token", "{\"text\":" + jsonString(chunk) + "}"));
                send(emitter, "complete", "{\"hasCorrection\":" + result.hasCorrection() + ",\"correctedText\":" + jsonString(result.correctedText()) + "}");
                emitter.complete();
            } catch (Exception exception) {
                try { send(emitter, "error", "{\"message\":\"AI service temporarily unavailable\"}"); } finally { emitter.complete(); }
            }
        });
        return emitter;
    }
    private ChatWithTutorCommand toCommand(ChatRequest request) {
        var history = request.history() == null ? List.<ChatHistoryMessage>of() : request.history().stream()
                .map(item -> new ChatHistoryMessage(ChatRole.valueOf(item.role().toUpperCase(java.util.Locale.ROOT)), item.content())).toList();
        return new ChatWithTutorCommand(request.message(), Language.fromCode(request.language()), history);
    }
    private static void send(SseEmitter emitter, String event, String data) {
        try { emitter.send(SseEmitter.event().name(event).data(data)); }
        catch (Exception exception) { throw new RuntimeException(exception); }
    }
    private static String jsonString(String value) {
        if (value == null) return "null";
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }
    public record ChatRequest(@NotBlank String message, @NotBlank @Pattern(regexp = "(?i)pt|en") String language,
                              @Size(max = 10) List<@Valid HistoryRequest> history) {}
    public record HistoryRequest(@NotBlank @Pattern(regexp = "(?i)user|assistant") String role, @NotBlank String content) {}
    public record ChatResponse(String reply, boolean hasCorrection, String correctedText) {}
}
