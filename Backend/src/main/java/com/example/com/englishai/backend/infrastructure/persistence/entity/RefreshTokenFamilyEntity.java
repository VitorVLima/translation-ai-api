package com.example.com.englishai.backend.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "refresh_token_families")
public class RefreshTokenFamilyEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "revoked_at")
    private OffsetDateTime revokedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "revocation_reason", length = 32)
    private RefreshTokenFamilyRevocationReason revocationReason;

    protected RefreshTokenFamilyEntity() {
    }

    public RefreshTokenFamilyEntity(
            UUID id,
            UUID userId,
            OffsetDateTime createdAt,
            OffsetDateTime expiresAt,
            OffsetDateTime revokedAt
    ) {
        this(id, userId, createdAt, expiresAt, revokedAt, null);
    }

    public RefreshTokenFamilyEntity(UUID id, UUID userId, OffsetDateTime createdAt,
                                    OffsetDateTime expiresAt, OffsetDateTime revokedAt,
                                    RefreshTokenFamilyRevocationReason revocationReason) {
        this.id = id;
        this.userId = userId;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.revokedAt = revokedAt;
        this.revocationReason = revocationReason;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public OffsetDateTime getRevokedAt() { return revokedAt; }
    public RefreshTokenFamilyRevocationReason getRevocationReason() { return revocationReason; }
}
