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
    public ResponseEntity<ReadingService.Reading> generate(@org.springframework.security.core.annotation.AuthenticationPrincipal java.util.UUID userId, @Valid @RequestBody GenerateRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(service.generateForUser(userId, request.difficulty(), request.topic()));
    }

    @PostMapping("/hint")
    public ResponseEntity<ReadingService.Hints> hint(@Valid @RequestBody HintRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(service.hint(request.text(), request.difficulty()));
    }

    @PostMapping("/questions")
    public ResponseEntity<ReadingService.Questions> questions(@org.springframework.security.core.annotation.AuthenticationPrincipal java.util.UUID userId, @Valid @RequestBody QuestionsRequest request) {
        if (request.activityId() == null && (request.text() == null || request.text().isBlank() || request.difficulty() == null))
            throw new IllegalArgumentException("Reading activityId or text/difficulty is required");
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(request.activityId() != null ? service.questionsForActivity(userId, request.activityId()) : service.questions(request.text(), request.difficulty()));
    }

    @PostMapping("/{activityId}/submit")
    public ResponseEntity<ReadingService.Submission> submit(@org.springframework.security.core.annotation.AuthenticationPrincipal java.util.UUID userId,
                                                              @PathVariable java.util.UUID activityId,
                                                              @jakarta.validation.Valid @RequestBody SubmitRequest request) {
        var answers = request.answers().stream().map(a -> new ReadingService.SubmissionAnswer(a.questionId(), a.selectedOption())).toList();
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.submit(userId, activityId, answers));
    }

    public record GenerateRequest(@NotNull ConversationDifficulty difficulty, @NotNull ReadingTopic topic) {}
    public record HintRequest(@NotBlank @Size(max = ReadingService.MAX_CHARACTERS) String text,
                              @NotNull ConversationDifficulty difficulty) {}
    public record QuestionsRequest(java.util.UUID activityId, @Size(max = ReadingService.MAX_CHARACTERS) String text,
                                   ConversationDifficulty difficulty) {}
    public record SubmitRequest(@jakarta.validation.constraints.NotNull @jakarta.validation.Valid java.util.List<Answer> answers) {}
    public record Answer(@jakarta.validation.constraints.NotNull java.util.UUID questionId, @jakarta.validation.constraints.Min(0) @jakarta.validation.constraints.Max(3) int selectedOption) {}
}
