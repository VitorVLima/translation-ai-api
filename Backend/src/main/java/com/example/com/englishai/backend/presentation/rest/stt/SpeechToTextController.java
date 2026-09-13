package com.example.com.englishai.backend.presentation.rest.stt;

import com.example.com.englishai.backend.application.stt.*;
import com.example.com.englishai.backend.application.translation.Language;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Locale;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/transcriptions")
public class SpeechToTextController {
    private static final Set<String> EXTENSIONS = Set.of("wav", "mp3", "m4a", "webm", "ogg");
    private final TranscribeAudio transcribeAudio;
    private final long maxBytes;

    public SpeechToTextController(TranscribeAudio transcribeAudio,
                                  @Value("${speech.stt.max-file-size-mb:20}") long maxMb) {
        this.transcribeAudio = transcribeAudio;
        this.maxBytes = maxMb * 1024L * 1024L;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<TranscriptionResponse> transcribe(
            @RequestPart("file") MultipartFile file,
            @RequestParam(value = "language", required = false) String language) {
        if (file == null || file.isEmpty()) throw new InvalidSpeechToTextRequestException("Audio file is required");
        if (file.getSize() > maxBytes) throw new SpeechToTextFileTooLargeException("Audio file is too large");
        Language requested = parseLanguage(language);
        String filename = file.getOriginalFilename();
        String extension = extension(filename);
        String contentType = file.getContentType();
        boolean typeAllowed = contentType == null || contentType.isBlank() || contentType.toLowerCase(Locale.ROOT).startsWith("audio/") || contentType.equalsIgnoreCase(MediaType.APPLICATION_OCTET_STREAM_VALUE);
        if (!EXTENSIONS.contains(extension) || !typeAllowed) throw new InvalidSpeechToTextRequestException("Unsupported audio format");
        try {
            var result = transcribeAudio.execute(new TranscribeAudioCommand(file.getBytes(), filename, contentType, requested));
            return ResponseEntity.ok().header("Cache-Control", "no-store").body(new TranscriptionResponse(result.text(), result.language().code()));
        } catch (IOException e) {
            throw new InvalidSpeechToTextRequestException("Unable to read audio file");
        }
    }

    private static Language parseLanguage(String value) {
        if (value == null) return null;
        if (value.isBlank()) throw new InvalidSpeechToTextRequestException("Language is invalid");
        if (!value.equalsIgnoreCase("pt") && !value.equalsIgnoreCase("en"))
            throw new InvalidSpeechToTextRequestException("Language is invalid");
        return Language.fromCode(value);
    }
    private static String extension(String filename) {
        if (filename == null) return "";
        int dot = filename.lastIndexOf('.');
        return dot >= 0 ? filename.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
    }
    public record TranscriptionResponse(String text, String language) { }
}
