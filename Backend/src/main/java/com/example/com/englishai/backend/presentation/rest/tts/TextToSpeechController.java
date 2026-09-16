package com.example.com.englishai.backend.presentation.rest.tts;

import com.example.com.englishai.backend.application.translation.Language;
import com.example.com.englishai.backend.application.tts.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/speech")
public class TextToSpeechController {
    private final SynthesizeSpeech synthesizeSpeech;
    private final ConversationSpeech conversationSpeech;
    public TextToSpeechController(SynthesizeSpeech synthesizeSpeech, ConversationSpeech conversationSpeech) {
        this.synthesizeSpeech = synthesizeSpeech;
        this.conversationSpeech = conversationSpeech;
    }

    @PostMapping(consumes = "application/json", produces = "audio/wav")
    public ResponseEntity<byte[]> synthesize(@Valid @RequestBody SpeechRequest request,
            @org.springframework.security.core.annotation.AuthenticationPrincipal java.util.UUID owner) {
        Language language;
        try { language = Language.fromCode(request.language()); } catch (IllegalArgumentException e) { throw new InvalidTextToSpeechRequestException("Invalid language"); }
        var result = request.conversationId() == null
                ? synthesizeSpeech.execute(new SynthesizeSpeechCommand(request.text(), language))
                : conversationSpeech.execute(owner, request.conversationId(), request.text());
        return ResponseEntity.ok().header("Cache-Control", "no-store").header("Content-Disposition", "inline").header("Content-Type", "audio/wav").body(result.audio());
    }

    public record SpeechRequest(@NotBlank(message = "Text is required") @Size(max = 3000, message = "Text is too long") String text,
                                @NotBlank(message = "Language is required") @Pattern(regexp = "(?i)pt|en", message = "Unsupported language") String language,
                                java.util.UUID conversationId) { }
}
