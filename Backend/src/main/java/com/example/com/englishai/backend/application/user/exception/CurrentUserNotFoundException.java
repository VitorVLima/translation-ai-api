package com.example.com.englishai.backend.application.user.exception;

public class CurrentUserNotFoundException extends RuntimeException {

    public CurrentUserNotFoundException() {
        super("Current user not found");
    }
}
