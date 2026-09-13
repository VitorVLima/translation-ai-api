package com.example.com.englishai.backend.application.tts;

public class InvalidTextToSpeechRequestException extends RuntimeException {
    public InvalidTextToSpeechRequestException(String message) { super(message); }
}
