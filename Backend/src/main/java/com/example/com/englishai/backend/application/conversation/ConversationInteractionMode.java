package com.example.com.englishai.backend.application.conversation;

public enum ConversationInteractionMode {
    TEXT, VOICE;

    public static ConversationInteractionMode from(String value) {
        if (value == null) return TEXT;
        return valueOf(value);
    }
}
