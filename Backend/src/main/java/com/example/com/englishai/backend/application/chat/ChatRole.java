package com.example.com.englishai.backend.application.chat;

public enum ChatRole {
    USER("user"), ASSISTANT("assistant");
    private final String code;
    ChatRole(String code) { this.code = code; }
    public String code() { return code; }
}
