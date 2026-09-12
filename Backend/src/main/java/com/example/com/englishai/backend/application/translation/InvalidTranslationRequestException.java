package com.example.com.englishai.backend.application.translation;

public class InvalidTranslationRequestException extends RuntimeException {
    public InvalidTranslationRequestException(String message) { super(message); }
}
