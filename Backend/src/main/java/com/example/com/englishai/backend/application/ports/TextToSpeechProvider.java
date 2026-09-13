package com.example.com.englishai.backend.application.ports;

import com.example.com.englishai.backend.application.tts.TextToSpeechRequest;
import com.example.com.englishai.backend.application.tts.TextToSpeechResult;

public interface TextToSpeechProvider {
    TextToSpeechResult synthesize(TextToSpeechRequest request);
}
