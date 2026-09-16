package com.example.com.englishai.backend.application.translation;

import java.util.List;

public record TranslationEnrichment(String usage, List<TranslationExample> examples) {
    public TranslationEnrichment {
        examples = examples == null ? List.of() : List.copyOf(examples);
    }
    public boolean isEmpty() { return (usage == null || usage.isBlank()) && examples.isEmpty(); }
}
