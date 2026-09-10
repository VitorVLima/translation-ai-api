package com.example.com.englishai.backend.application.authentication.exception;

/** Provider-independent failure while requesting delivery of an email. */
public class EmailDeliveryException extends RuntimeException {
    public EmailDeliveryException() {
        super("Email delivery failed");
    }
}
