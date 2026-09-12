package com.example.com.englishai.backend.application.translation;

public record ExplainCorrectionCommand(String originalText, String correctedText, Language language) {}
