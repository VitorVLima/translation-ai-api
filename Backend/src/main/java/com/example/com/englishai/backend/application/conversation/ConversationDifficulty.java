package com.example.com.englishai.backend.application.conversation;

public enum ConversationDifficulty {
    BEGINNER("A1-A2"),
    INTERMEDIATE("B1-B2"),
    ADVANCED("C1-C2");

    private final String cefrRange;

    ConversationDifficulty(String cefrRange) {
        this.cefrRange = cefrRange;
    }

    public String cefrRange() {
        return cefrRange;
    }

    public static ConversationDifficulty from(String value) {
        if (value == null || value.isBlank()) return INTERMEDIATE;
        try {
            return valueOf(value.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Invalid conversation difficulty");
        }
    }
}
