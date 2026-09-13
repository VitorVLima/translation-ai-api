package com.example.com.englishai.backend.infrastructure.stt;

import com.example.com.englishai.backend.application.ports.SpeechToTextProvider;
import com.example.com.englishai.backend.application.stt.TranscribeAudio;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.time.Duration;

@Configuration
public class SpeechToTextConfig {
    @Bean
    public SpeechToTextProvider speechToTextProvider(
            @Value("${speech.stt.provider:whisper}") String provider,
            @Value("${speech.stt.whisper.base-url:http://127.0.0.1:8001}") String baseUrl,
            @Value("${speech.stt.connect-timeout-seconds:5}") long connectTimeout,
            @Value("${speech.stt.response-timeout-seconds:120}") long responseTimeout) {
        if (connectTimeout <= 0 || responseTimeout <= 0) throw new IllegalArgumentException("STT timeouts must be positive");
        if (provider == null) throw new IllegalArgumentException("STT_PROVIDER is required");
        return switch (provider.trim().toLowerCase(java.util.Locale.ROOT)) {
            case "whisper" -> new WhisperSpeechToTextProvider(baseUrl, Duration.ofSeconds(connectTimeout), Duration.ofSeconds(responseTimeout));
            default -> throw new IllegalArgumentException("Unsupported STT_PROVIDER");
        };
    }

    @Bean
    public TranscribeAudio transcribeAudio(SpeechToTextProvider provider,
            @Value("${speech.stt.max-file-size-mb:20}") long maxMb) {
        if (maxMb <= 0) throw new IllegalArgumentException("STT_MAX_FILE_SIZE_MB must be positive");
        return new TranscribeAudio(provider, Math.multiplyExact(maxMb, 1024L * 1024L));
    }
}
