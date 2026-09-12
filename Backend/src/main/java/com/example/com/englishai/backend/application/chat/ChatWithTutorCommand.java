package com.example.com.englishai.backend.application.chat;

import com.example.com.englishai.backend.application.translation.Language;
import java.util.List;

public record ChatWithTutorCommand(String message, Language language, List<ChatHistoryMessage> history) {
    public ChatWithTutorCommand(String message, Language language) { this(message, language, List.of()); }
}
