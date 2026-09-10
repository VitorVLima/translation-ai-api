package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.infrastructure.persistence.entity.EmailVerificationCodeEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;

import java.util.Optional;
import java.util.UUID;

public interface EmailVerificationCodeJpaRepository extends JpaRepository<EmailVerificationCodeEntity, UUID> {
    Optional<EmailVerificationCodeEntity> findFirstByUserIdOrderByCreatedAtDesc(UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<EmailVerificationCodeEntity> findFirstByUserIdAndUsedAtIsNullAndInvalidatedAtIsNullAndExpiresAtAfterOrderByCreatedAtDesc(
            UUID userId, OffsetDateTime now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    java.util.List<EmailVerificationCodeEntity> findByUserIdOrderByCreatedAtDesc(UUID userId);
}
