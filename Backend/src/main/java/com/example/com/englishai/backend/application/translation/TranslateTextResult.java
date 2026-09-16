package com.example.com.englishai.backend.application.translation;

public record TranslateTextResult(String translation, TranslationEnrichment enrichment) {
    public TranslateTextResult(String translation) { this(translation, null); }
    public TranslateTextResult {
        if (translation == null || translation.isBlank()) throw new IllegalArgumentException("translation is empty");
    }
}
