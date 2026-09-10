package com.example.com.englishai.backend.application.authentication.exception;

public class InvalidEmailVerificationCodeException extends RuntimeException {
    public InvalidEmailVerificationCodeException() {
        super("Invalid or expired verification code");
    }
}
