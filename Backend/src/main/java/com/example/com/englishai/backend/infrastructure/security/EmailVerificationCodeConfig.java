package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.ports.EmailVerificationCodeGenerator;
import com.example.com.englishai.backend.application.ports.EmailVerificationCodeHasher;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class EmailVerificationCodeConfig {
    @Bean
    public EmailVerificationCodeGenerator emailVerificationCodeGenerator() {
        return new SecureEmailVerificationCodeGenerator();
    }

    @Bean
    public EmailVerificationCodeHasher emailVerificationCodeHasher(
            @Value("${SECURITY_EMAIL_VERIFICATION_CODE_HASH_SECRET:}") String secret) {
        return new HmacEmailVerificationCodeHasher(secret);
    }

    @Bean
    public Duration emailVerificationCodeExpiration(
            @Value("${SECURITY_EMAIL_VERIFICATION_CODE_EXPIRATION_SECONDS:600}") long seconds) {
        if (seconds <= 0) throw new IllegalArgumentException("Email verification code expiration must be positive");
        return Duration.ofSeconds(seconds);
    }

    @Bean
    public Integer emailVerificationMaxAttempts(
            @Value("${SECURITY_EMAIL_VERIFICATION_MAX_ATTEMPTS:5}") int attempts) {
        if (attempts <= 0) throw new IllegalArgumentException("Email verification max attempts must be positive");
        return attempts;
    }
}
