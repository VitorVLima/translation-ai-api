package com.example.com.englishai.backend.application.conversation;

public class ConversationLimitReachedException extends RuntimeException {
    public ConversationLimitReachedException() { super("You can have at most 3 conversations."); }
}
