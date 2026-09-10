package com.example.com.englishai.backend.domain.authentication;

import java.time.OffsetDateTime;
import java.util.UUID;

public class EmailVerificationCode {
    private final UUID id;
    private final UUID userId;
    private final String codeHash;
    private final OffsetDateTime createdAt;
    private final OffsetDateTime expiresAt;
    private final OffsetDateTime usedAt;
    private final OffsetDateTime invalidatedAt;
    private final int attempts;
    private final int maxAttempts;

    public EmailVerificationCode(UUID id, UUID userId, String codeHash, OffsetDateTime createdAt,
                                 OffsetDateTime expiresAt, OffsetDateTime usedAt,
                                 int attempts, int maxAttempts) {
        this(id, userId, codeHash, createdAt, expiresAt, usedAt, null, attempts, maxAttempts);
    }

    public EmailVerificationCode(UUID id, UUID userId, String codeHash, OffsetDateTime createdAt,
                                 OffsetDateTime expiresAt, OffsetDateTime usedAt, OffsetDateTime invalidatedAt,
                                 int attempts, int maxAttempts) {
        this.id = id;
        this.userId = userId;
        this.codeHash = codeHash;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.usedAt = usedAt;
        this.invalidatedAt = invalidatedAt;
        this.attempts = attempts;
        this.maxAttempts = maxAttempts;
        if (attempts < 0 || maxAttempts <= 0 || attempts > maxAttempts) {
            throw new IllegalArgumentException("Invalid email verification attempts");
        }
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

    public EmailVerificationCode incrementAttempts() {
        return new EmailVerificationCode(id, userId, codeHash, createdAt, expiresAt, usedAt,
                invalidatedAt, attempts + 1, maxAttempts);
    }

    public EmailVerificationCode markUsed(OffsetDateTime at) {
        return new EmailVerificationCode(id, userId, codeHash, createdAt, expiresAt, at,
                invalidatedAt, attempts, maxAttempts);
    }

    public EmailVerificationCode invalidate(OffsetDateTime at) {
        return new EmailVerificationCode(id, userId, codeHash, createdAt, expiresAt, usedAt,
                at, attempts, maxAttempts);
    }

    @Override
    public String toString() {
        return "EmailVerificationCode[id=" + id + ", userId=" + userId
                + ", createdAt=" + createdAt + ", expiresAt=" + expiresAt
                + ", usedAt=" + usedAt + ", attempts=" + attempts
                + ", maxAttempts=" + maxAttempts + ", codeHash=[REDACTED]]";
    }
}
