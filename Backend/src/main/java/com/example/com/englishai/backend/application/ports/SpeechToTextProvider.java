package com.example.com.englishai.backend.application.ports;

import com.example.com.englishai.backend.application.stt.SpeechToTextRequest;
import com.example.com.englishai.backend.application.stt.SpeechToTextResult;

public interface SpeechToTextProvider {
    SpeechToTextResult transcribe(SpeechToTextRequest request);
}
