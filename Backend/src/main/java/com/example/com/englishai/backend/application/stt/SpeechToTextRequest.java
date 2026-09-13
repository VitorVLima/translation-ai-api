package com.example.com.englishai.backend.application.stt;

import com.example.com.englishai.backend.application.translation.Language;

public record SpeechToTextRequest(byte[] audio, String filename, String contentType, Language language) { }
