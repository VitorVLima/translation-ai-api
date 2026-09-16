package com.example.com.englishai.backend.presentation.rest.translation;

import com.example.com.englishai.backend.application.translation.CorrectText;
import com.example.com.englishai.backend.application.translation.CorrectTextCommand;
import com.example.com.englishai.backend.application.translation.Language;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/correct")
public class CorrectionController {
    private final CorrectText correctText;
    public CorrectionController(CorrectText correctText) { this.correctText = correctText; }

    @PostMapping
    public ResponseEntity<CorrectionResponse> correct(@Valid @RequestBody CorrectionRequest request) {
        var result = correctText.execute(new CorrectTextCommand(request.text(), Language.fromCode(request.language())));
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(new CorrectionResponse(result.correctedText(), result.status(), result.explanation(), result.usageTip(), result.alternatives(), result.examples()));
    }

    public record CorrectionRequest(
            @NotBlank(message = "Text is required") String text,
            @NotBlank(message = "Language is required") @Pattern(regexp = "(?i)en", message = "Correction supports English only") String language) {}

    public record CorrectionResponse(String correctedText, com.example.com.englishai.backend.application.translation.CorrectionStatus status, String explanation, String usageTip, java.util.List<String> alternatives, java.util.List<com.example.com.englishai.backend.application.translation.CorrectionExample> examples) {}
}
