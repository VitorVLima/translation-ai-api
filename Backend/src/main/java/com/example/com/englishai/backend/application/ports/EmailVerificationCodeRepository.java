package com.example.com.englishai.backend.application.ports;

import com.example.com.englishai.backend.domain.authentication.EmailVerificationCode;

import java.util.Optional;
import java.util.UUID;

public interface EmailVerificationCodeRepository {
    EmailVerificationCode save(EmailVerificationCode code);
    Optional<EmailVerificationCode> findById(UUID id);
    Optional<EmailVerificationCode> findLatestByUserId(UUID userId);
    Optional<EmailVerificationCode> findLatestActiveByUserIdForUpdate(UUID userId, java.time.OffsetDateTime now);
    java.util.List<EmailVerificationCode> findByUserIdForUpdate(UUID userId);
}
