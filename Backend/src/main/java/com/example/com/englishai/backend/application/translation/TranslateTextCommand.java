package com.example.com.englishai.backend.application.translation;

public record TranslateTextCommand(String text, Language sourceLanguage, Language targetLanguage) {
    public TranslateTextCommand {
        if (text == null || text.isBlank()) throw new InvalidTranslationRequestException("text is required");
        if (sourceLanguage == null || targetLanguage == null) throw new InvalidTranslationRequestException("languages are required");
        if (sourceLanguage == targetLanguage) throw new InvalidTranslationRequestException("source and target languages must differ");
    }
}
