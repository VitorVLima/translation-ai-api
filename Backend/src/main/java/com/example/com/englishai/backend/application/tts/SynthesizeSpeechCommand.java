package com.example.com.englishai.backend.application.tts;

import com.example.com.englishai.backend.application.translation.Language;

public record SynthesizeSpeechCommand(String text, Language language) { }
