package com.example.com.englishai.backend.presentation.rest.translation;

import com.example.com.englishai.backend.application.translation.Language;
import com.example.com.englishai.backend.application.translation.TranslateText;
import com.example.com.englishai.backend.application.translation.TranslateTextCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/translate")
public class TranslationController {
    private final TranslateText translateText;
    public TranslationController(TranslateText translateText) { this.translateText = translateText; }

    @PostMapping
    public ResponseEntity<TranslationResponse> translate(@Valid @RequestBody TranslationRequest request) {
        var result = translateText.execute(new TranslateTextCommand(request.text(),
                Language.fromCode(request.sourceLanguage()), Language.fromCode(request.targetLanguage())));
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(new TranslationResponse(result.translation()));
    }

    public record TranslationRequest(
            @NotBlank(message = "Text is required") @Size(max = 5000, message = "Text is too long") String text,
            @NotBlank(message = "Source language is required") @Pattern(regexp = "(?i)pt|en", message = "Unsupported language") String sourceLanguage,
            @NotBlank(message = "Target language is required") @Pattern(regexp = "(?i)pt|en", message = "Unsupported language") String targetLanguage) {}

    public record TranslationResponse(String translation) {}
}
