package com.example.com.englishai.backend.application.stt;

public class InvalidSpeechToTextRequestException extends RuntimeException {
    public InvalidSpeechToTextRequestException(String message) { super(message); }
}
