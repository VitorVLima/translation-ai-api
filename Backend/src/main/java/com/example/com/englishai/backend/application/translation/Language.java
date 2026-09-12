package com.example.com.englishai.backend.application.translation;

public enum Language {
    PORTUGUESE("pt"), ENGLISH("en");

    private final String code;
    Language(String code) { this.code = code; }
    public String code() { return code; }

    public static Language fromCode(String value) {
        if (value == null) throw new IllegalArgumentException("Unsupported language");
        for (Language language : values()) if (language.code.equalsIgnoreCase(value.trim())) return language;
        throw new IllegalArgumentException("Unsupported language");
    }
}
