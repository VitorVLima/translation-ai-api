package com.example.com.englishai.backend.application.ports;

import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamily;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenFamilyRepository {

    RefreshTokenFamily save(RefreshTokenFamily family);

    Optional<RefreshTokenFamily> findById(UUID id);

    Optional<RefreshTokenFamily> findByIdForUpdate(UUID id);

    void revoke(UUID id, OffsetDateTime revokedAt);

    void revoke(UUID id, OffsetDateTime revokedAt, RefreshTokenFamilyRevocationReason reason);

    void revokeAllByUserId(UUID userId, OffsetDateTime revokedAt, RefreshTokenFamilyRevocationReason reason);
}
