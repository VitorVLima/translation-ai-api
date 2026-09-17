package com.example.com.englishai.backend.application.conversation;

public class ConversationLimitReachedException extends RuntimeException {
    public ConversationLimitReachedException() { super("You already have 3 active conversations. End or delete one to start another."); }
}
