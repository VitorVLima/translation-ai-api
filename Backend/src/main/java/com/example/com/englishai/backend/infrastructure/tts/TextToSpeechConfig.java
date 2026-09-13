package com.example.com.englishai.backend.infrastructure.tts;

import com.example.com.englishai.backend.application.ports.TextToSpeechProvider;
import com.example.com.englishai.backend.application.tts.SynthesizeSpeech;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.time.Duration;

@Configuration
public class TextToSpeechConfig {
    @Bean
    public TextToSpeechProvider textToSpeechProvider(
            @Value("${speech.tts.provider:piper}") String provider,
            @Value("${speech.tts.piper.base-url:http://127.0.0.1:8002}") String baseUrl,
            @Value("${speech.tts.connect-timeout-seconds:5}") long connectTimeout,
            @Value("${speech.tts.response-timeout-seconds:60}") long responseTimeout) {
        if (connectTimeout <= 0 || responseTimeout <= 0) throw new IllegalArgumentException("TTS timeouts must be positive");
        if (provider == null) throw new IllegalArgumentException("TTS_PROVIDER is required");
        return switch (provider.trim().toLowerCase(java.util.Locale.ROOT)) {
            case "piper" -> new PiperTextToSpeechProvider(baseUrl, Duration.ofSeconds(connectTimeout), Duration.ofSeconds(responseTimeout));
            default -> throw new IllegalArgumentException("Unsupported TTS_PROVIDER");
        };
    }

    @Bean
    public SynthesizeSpeech synthesizeSpeech(TextToSpeechProvider provider,
            @Value("${speech.tts.max-text-length:3000}") int maxLength) {
        if (maxLength <= 0) throw new IllegalArgumentException("TTS_MAX_TEXT_LENGTH must be positive");
        return new SynthesizeSpeech(provider, maxLength);
    }
}
