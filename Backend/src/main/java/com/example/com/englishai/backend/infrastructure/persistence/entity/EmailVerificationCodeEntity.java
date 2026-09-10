package com.example.com.englishai.backend.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "email_verification_codes")
public class EmailVerificationCodeEntity {
    @Id private UUID id;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "code_hash", nullable = false, length = 64) private String codeHash;
    @Column(name = "created_at", nullable = false) private OffsetDateTime createdAt;
    @Column(name = "expires_at", nullable = false) private OffsetDateTime expiresAt;
    @Column(name = "used_at") private OffsetDateTime usedAt;
    @Column(name = "invalidated_at") private OffsetDateTime invalidatedAt;
    @Column(nullable = false) private int attempts;
    @Column(name = "max_attempts", nullable = false) private int maxAttempts;

    protected EmailVerificationCodeEntity() { }

    public EmailVerificationCodeEntity(UUID id, UUID userId, String codeHash, OffsetDateTime createdAt,
                                       OffsetDateTime expiresAt, OffsetDateTime usedAt,
                                       int attempts, int maxAttempts) {
        this(id, userId, codeHash, createdAt, expiresAt, usedAt, null, attempts, maxAttempts);
    }
    public EmailVerificationCodeEntity(UUID id, UUID userId, String codeHash, OffsetDateTime createdAt,
                                       OffsetDateTime expiresAt, OffsetDateTime usedAt, OffsetDateTime invalidatedAt,
                                       int attempts, int maxAttempts) {
        this.id = id; this.userId = userId; this.codeHash = codeHash; this.createdAt = createdAt;
        this.expiresAt = expiresAt; this.usedAt = usedAt; this.invalidatedAt = invalidatedAt; this.attempts = attempts; this.maxAttempts = maxAttempts;
    }
    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getCodeHash() { return codeHash; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public OffsetDateTime getUsedAt() { return usedAt; }
    public OffsetDateTime getInvalidatedAt() { return invalidatedAt; }
    public int getAttempts() { return attempts; }
    public int getMaxAttempts() { return maxAttempts; }

    @Override public String toString() {
        return "EmailVerificationCodeEntity[id=" + id + ", userId=" + userId
                + ", createdAt=" + createdAt + ", expiresAt=" + expiresAt + ", usedAt=" + usedAt
                + ", attempts=" + attempts + ", maxAttempts=" + maxAttempts + ", codeHash=[REDACTED]]";
    }
}
