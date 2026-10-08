package com.example.com.englishai.backend.application.user.exception;

/**
 * Signals a legacy case-insensitive collision that must be resolved manually
 * before an e-mail lookup can safely identify one account.
 */
public class AmbiguousEmailAddressException extends RuntimeException {
    public AmbiguousEmailAddressException() {
        super("Ambiguous e-mail address");
    }
}
