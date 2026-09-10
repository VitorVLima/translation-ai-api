package com.example.com.englishai.backend.application.ports;

public interface EmailVerificationCodeHasher {
    String hash(String code);
}
