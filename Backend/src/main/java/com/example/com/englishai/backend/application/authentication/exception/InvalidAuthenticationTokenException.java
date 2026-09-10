package com.example.com.englishai.backend.application.authentication.exception;

public class InvalidAuthenticationTokenException extends RuntimeException {

    public InvalidAuthenticationTokenException() {
        super("Invalid or expired authentication token");
    }
}
