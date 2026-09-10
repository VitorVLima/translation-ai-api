package com.example.com.englishai.backend.application.authentication.exception;

public class InvalidPasswordResetCodeException extends RuntimeException {
    public InvalidPasswordResetCodeException() { super("Invalid or expired password reset code"); }
}
