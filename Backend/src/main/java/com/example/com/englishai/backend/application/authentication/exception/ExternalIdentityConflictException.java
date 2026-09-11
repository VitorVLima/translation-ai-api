package com.example.com.englishai.backend.application.authentication.exception;

public class ExternalIdentityConflictException extends RuntimeException {
    public ExternalIdentityConflictException() { super("External identity conflict"); }
}
