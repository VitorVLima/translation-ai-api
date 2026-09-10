package com.example.com.englishai.backend.application.ports;

public interface EmailSender {
    void sendEmailVerificationCode(String recipientEmail, String code);
}
