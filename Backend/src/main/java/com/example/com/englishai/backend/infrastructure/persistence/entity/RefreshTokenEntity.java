package com.example.com.englishai.backend.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import com.example.com.englishai.backend.domain.authentication.TokenRevocationReason;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "refresh_tokens")
public class RefreshTokenEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "family_id", nullable = false)
    private UUID familyId;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "revoked_at")
    private OffsetDateTime revokedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "revocation_reason", length = 32)
    private TokenRevocationReason revocationReason;

    @Column(name = "replaced_by_id")
    private UUID replacedById;

    protected RefreshTokenEntity() {
    }

    public RefreshTokenEntity(
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

    public RefreshTokenEntity(UUID id, UUID userId, UUID familyId, String tokenHash,
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
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public UUID getFamilyId() { return familyId; }
    public String getTokenHash() { return tokenHash; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getRevokedAt() { return revokedAt; }
    public UUID getReplacedById() { return replacedById; }
    public TokenRevocationReason getRevocationReason() { return revocationReason; }

    @Override
    public String toString() {
        return "RefreshTokenEntity[id=" + id + ", userId=" + userId + ", familyId=" + familyId
                + ", expiresAt=" + expiresAt + ", createdAt=" + createdAt
                + ", revokedAt=" + revokedAt + ", replacedById=" + replacedById
                + ", revocationReason=" + revocationReason + ", tokenHash=[REDACTED]]";
    }
}
