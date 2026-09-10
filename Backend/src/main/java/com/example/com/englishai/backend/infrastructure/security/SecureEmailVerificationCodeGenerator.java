package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.ports.EmailVerificationCodeGenerator;

import java.security.SecureRandom;

public class SecureEmailVerificationCodeGenerator implements EmailVerificationCodeGenerator {
    private final SecureRandom random;

    public SecureEmailVerificationCodeGenerator() {
        this(new SecureRandom());
    }

    public SecureEmailVerificationCodeGenerator(SecureRandom random) {
        this.random = random;
    }

    @Override
    public String generate() {
        return "%06d".formatted(random.nextInt(1_000_000));
    }
}
