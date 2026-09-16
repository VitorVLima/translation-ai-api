package com.example.com.englishai.backend.presentation.rest.reading;

import com.example.com.englishai.backend.application.conversation.ConversationDifficulty;
import com.example.com.englishai.backend.application.reading.ReadingService;
import com.example.com.englishai.backend.application.reading.ReadingTopic;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/reading")
public class ReadingController {
    private final ReadingService service;
    public ReadingController(ReadingService service) { this.service = service; }

    @PostMapping("/generate")
    public ResponseEntity<ReadingService.Reading> generate(@Valid @RequestBody GenerateRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(service.generate(request.difficulty(), request.topic()));
    }

    @PostMapping("/hint")
    public ResponseEntity<ReadingService.Hints> hint(@Valid @RequestBody HintRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(service.hint(request.text(), request.difficulty()));
    }

    @PostMapping("/questions")
    public ResponseEntity<ReadingService.Questions> questions(@Valid @RequestBody QuestionsRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(service.questions(request.text(), request.difficulty()));
    }

    public record GenerateRequest(@NotNull ConversationDifficulty difficulty, @NotNull ReadingTopic topic) {}
    public record HintRequest(@NotBlank @Size(max = ReadingService.MAX_CHARACTERS) String text,
                              @NotNull ConversationDifficulty difficulty) {}
    public record QuestionsRequest(@NotBlank @Size(max = ReadingService.MAX_CHARACTERS) String text,
                                   @NotNull ConversationDifficulty difficulty) {}
}
