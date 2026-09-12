package com.example.com.englishai.backend.presentation.rest.translation;

import com.example.com.englishai.backend.application.translation.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/correct/explain")
public class CorrectionExplanationController {
    private final ExplainCorrection explainCorrection;
    public CorrectionExplanationController(ExplainCorrection explainCorrection) { this.explainCorrection = explainCorrection; }

    @PostMapping
    public ResponseEntity<ExplanationResponse> explain(@Valid @RequestBody ExplanationRequest request) {
        var result = explainCorrection.execute(new ExplainCorrectionCommand(request.originalText(), request.correctedText(), Language.fromCode(request.language())));
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(new ExplanationResponse(result.explanation()));
    }

    public record ExplanationRequest(@NotBlank String originalText, @NotBlank String correctedText,
                                     @NotBlank @Pattern(regexp = "(?i)pt|en") String language) {}
    public record ExplanationResponse(String explanation) {}
}
