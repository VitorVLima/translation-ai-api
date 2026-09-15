package com.example.com.englishai.backend.application.conversation;

public enum ConversationScenario {
    FREE_TALK("Conversa livre", "Converse naturalmente com seu tutor.", "EnglishAI", "tutor_default"),
    JOB_INTERVIEW("Entrevista de emprego", "Pratique uma entrevista profissional.", "Interviewer", "interviewer_default"),
    FRIENDS("Amigos", "Pratique uma conversa casual.", "Alex", "friend_default"),
    SELF_INTRODUCTION("Apresentação pessoal", "Pratique como se apresentar.", "EnglishAI", "tutor_default"),
    RESTAURANT("Restaurante", "Pratique situações em um restaurante.", "Waiter", "waiter_default"),
    TRAVEL("Viagem", "Pratique situações comuns de viagem.", "EnglishAI", "tutor_default");

    private final String displayName, description, assistantDisplayName, assistantAvatarKey;
    ConversationScenario(String displayName, String description, String assistantDisplayName, String assistantAvatarKey) {
        this.displayName = displayName; this.description = description;
        this.assistantDisplayName = assistantDisplayName; this.assistantAvatarKey = assistantAvatarKey;
    }
    public String displayName() { return displayName; }
    public String description() { return description; }
    public String assistantDisplayName() { return assistantDisplayName; }
    public String assistantAvatarKey() { return assistantAvatarKey; }
}
