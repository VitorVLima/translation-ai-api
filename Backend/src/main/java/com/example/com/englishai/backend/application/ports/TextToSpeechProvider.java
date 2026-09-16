package com.example.com.englishai.backend.application.ports;

import com.example.com.englishai.backend.application.tts.TextToSpeechRequest;
import com.example.com.englishai.backend.application.tts.TextToSpeechResult;

public interface TextToSpeechProvider {
    TextToSpeechResult synthesize(TextToSpeechRequest request);

    default java.util.List<com.example.com.englishai.backend.application.tts.TtsVoice> voices() {
        return java.util.List.of();
    }
}
