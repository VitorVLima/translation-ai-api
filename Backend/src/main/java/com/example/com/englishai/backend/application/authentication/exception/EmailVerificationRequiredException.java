package com.example.com.englishai.backend.application.authentication.exception;

public class EmailVerificationRequiredException extends RuntimeException {
    public EmailVerificationRequiredException() {
        super("Email verification required");
    }
}
