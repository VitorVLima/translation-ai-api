package com.example.com.englishai.backend.application.authentication.exception;

public class InvalidAuthenticationTokenException extends RuntimeException {

    public enum Reason {
        MISSING,
        MALFORMED,
        INVALID_ALGORITHM,
        SIGNATURE_INVALID,
        INVALID_TOKEN_TYPE,
        INVALID_ISSUER,
        INVALID_AUDIENCE,
        EXPIRED,
        INVALID_IAT,
        INVALID_SUBJECT
    }

    private final Reason reason;

    public InvalidAuthenticationTokenException() {
        this(Reason.MALFORMED);
    }

    public InvalidAuthenticationTokenException(Reason reason) {
        super("Invalid or expired authentication token");
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
