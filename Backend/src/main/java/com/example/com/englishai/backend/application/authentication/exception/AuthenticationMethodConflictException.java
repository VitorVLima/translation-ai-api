package com.example.com.englishai.backend.application.authentication.exception;

public class AuthenticationMethodConflictException extends RuntimeException {
    public AuthenticationMethodConflictException() { super("This email is already registered with password authentication"); }
}
