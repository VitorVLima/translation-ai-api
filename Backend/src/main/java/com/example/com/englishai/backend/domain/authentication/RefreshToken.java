package com.example.com.englishai.backend.domain.authentication;

import java.time.OffsetDateTime;
import java.util.UUID;

public class RefreshToken {

    private final UUID id;
    private final UUID userId;
    private final UUID familyId;
    private final String tokenHash;
    private final OffsetDateTime expiresAt;
    private final OffsetDateTime createdAt;
    private final OffsetDateTime revokedAt;
    private final UUID replacedById;
    private final TokenRevocationReason revocationReason;

    public RefreshToken(
            UUID id,
            UUID userId,
            UUID familyId,
            String tokenHash,
            OffsetDateTime expiresAt,
            OffsetDateTime createdAt,
            OffsetDateTime revokedAt,
            UUID replacedById
    ) {
        this(id, userId, familyId, tokenHash, expiresAt, createdAt, revokedAt, replacedById, null);
    }

    public RefreshToken(UUID id, UUID userId, UUID familyId, String tokenHash,
                        OffsetDateTime expiresAt, OffsetDateTime createdAt,
                        OffsetDateTime revokedAt, UUID replacedById,
                        TokenRevocationReason revocationReason) {
        this.id = id;
        this.userId = userId;
        this.familyId = familyId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
        this.revokedAt = revokedAt;
        this.replacedById = replacedById;
        this.revocationReason = revocationReason;
        if (revocationReason != null && revokedAt == null) {
            throw new IllegalArgumentException("Revocation reason requires revokedAt");
        }
        if (revocationReason == TokenRevocationReason.ROTATED && replacedById == null) {
            throw new IllegalArgumentException("Rotated token requires replacedById");
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getFamilyId() {
        return familyId;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getRevokedAt() {
        return revokedAt;
    }

    public UUID getReplacedById() {
        return replacedById;
    }

    public TokenRevocationReason getRevocationReason() { return revocationReason; }
}
