package com.example.com.englishai.backend.domain.authentication;

import java.time.OffsetDateTime;
import java.util.UUID;

public class RefreshTokenFamily {

    private final UUID id;
    private final UUID userId;
    private final OffsetDateTime createdAt;
    private final OffsetDateTime expiresAt;
    private final OffsetDateTime revokedAt;
    private final RefreshTokenFamilyRevocationReason revocationReason;

    public RefreshTokenFamily(
            UUID id,
            UUID userId,
            OffsetDateTime createdAt,
            OffsetDateTime expiresAt,
            OffsetDateTime revokedAt
    ) {
        this(id, userId, createdAt, expiresAt, revokedAt, null);
    }

    public RefreshTokenFamily(UUID id, UUID userId, OffsetDateTime createdAt,
                              OffsetDateTime expiresAt, OffsetDateTime revokedAt,
                              RefreshTokenFamilyRevocationReason revocationReason) {
        this.id = id;
        this.userId = userId;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.revokedAt = revokedAt;
        this.revocationReason = revocationReason;
        if (revocationReason != null && revokedAt == null) {
            throw new IllegalArgumentException("Revocation reason requires revokedAt");
        }
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public OffsetDateTime getRevokedAt() { return revokedAt; }
    public RefreshTokenFamilyRevocationReason getRevocationReason() { return revocationReason; }
}
