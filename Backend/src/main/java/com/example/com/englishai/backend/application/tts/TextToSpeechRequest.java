package com.example.com.englishai.backend.application.tts;

import com.example.com.englishai.backend.application.translation.Language;

public record TextToSpeechRequest(String text, Language language) { }
