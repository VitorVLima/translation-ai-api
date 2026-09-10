package com.example.com.englishai.backend.application.ports;

import com.example.com.englishai.backend.domain.authentication.RefreshToken;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository {

    RefreshToken save(RefreshToken refreshToken);

    /**
     * Persists a rotation atomically, inserting the replacement before linking
     * the previous token to it.
     */
    void persistRotation(RefreshToken previousToken, RefreshToken replacementToken);

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    Optional<RefreshToken> findByTokenHashForUpdate(String tokenHash);

    Optional<RefreshToken> findById(UUID id);

    void revoke(UUID id, OffsetDateTime revokedAt);

    void revokeFamily(UUID familyId, OffsetDateTime revokedAt);
}
