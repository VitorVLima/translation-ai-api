package com.example.com.englishai.backend.presentation.rest.vocabulary;

import com.example.com.englishai.backend.application.vocabulary.VocabularyService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/vocabulary")
public class VocabularyController {
    private final VocabularyService service;

    public VocabularyController(VocabularyService service) {
        this.service = service;
    }

    @GetMapping("/today")
    public VocabularyService.Lesson today(@AuthenticationPrincipal UUID userId) {
        return service.today(userId);
    }

    @PostMapping("/quiz")
    public VocabularyService.QuizResult quiz(@AuthenticationPrincipal UUID userId,
                                             @Valid @RequestBody QuizRequest request) {
        return service.submitQuiz(userId, request.lessonId(), request.answers().stream()
                .map(answer -> new VocabularyService.QuizAnswer(answer.wordId(), answer.selectedWordId())).toList());
    }

    @PostMapping("/evaluate")
    public VocabularyService.Evaluation evaluate(@AuthenticationPrincipal UUID userId,
                                                  @Valid @RequestBody EvaluationRequest request) {
        return service.evaluate(userId, request.lessonId(), request.wordId(), request.sentence());
    }

    public record QuizAnswerRequest(@NotNull UUID wordId, @NotNull UUID selectedWordId) {}
    public record QuizRequest(@NotNull UUID lessonId,
                              @NotNull @Size(min = VocabularyService.QUIZ_QUESTION_COUNT,
                                      max = VocabularyService.QUIZ_QUESTION_COUNT)
                              List<@Valid QuizAnswerRequest> answers) {}
    public record EvaluationRequest(@NotNull UUID lessonId, @NotNull UUID wordId,
                                    @NotBlank @Size(max = VocabularyService.MAX_SENTENCE_LENGTH) String sentence) {}
}
