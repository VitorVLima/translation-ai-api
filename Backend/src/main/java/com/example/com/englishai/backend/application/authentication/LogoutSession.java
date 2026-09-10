package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.ports.RefreshTokenFamilyRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenHasher;
import com.example.com.englishai.backend.application.ports.RefreshTokenRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenTransaction;
import com.example.com.englishai.backend.domain.authentication.RefreshToken;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamily;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;

/** Revokes the session represented by a refresh token. The operation is idempotent. */
public class LogoutSession {

    private final RefreshTokenHasher hasher;
    private final RefreshTokenRepository tokenRepository;
    private final RefreshTokenFamilyRepository familyRepository;
    private final RefreshTokenTransaction transaction;
    private final Clock clock;

    public LogoutSession(RefreshTokenHasher hasher, RefreshTokenRepository tokenRepository,
                         RefreshTokenFamilyRepository familyRepository,
                         RefreshTokenTransaction transaction, Clock clock) {
        this.hasher = Objects.requireNonNull(hasher);
        this.tokenRepository = Objects.requireNonNull(tokenRepository);
        this.familyRepository = Objects.requireNonNull(familyRepository);
        this.transaction = Objects.requireNonNull(transaction);
        this.clock = Objects.requireNonNull(clock);
    }

    public void execute(String rawRefreshToken) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            return;
        }
        String tokenHash = hasher.hash(rawRefreshToken);
        RefreshToken metadata = tokenRepository.findByTokenHash(tokenHash).orElse(null);
        if (metadata == null) {
            return;
        }
        transaction.execute(repository -> logout(repository, tokenHash, metadata));
    }

    private Void logout(RefreshTokenRepository repository, String tokenHash, RefreshToken metadata) {
        RefreshTokenFamily family = familyRepository.findByIdForUpdate(metadata.getFamilyId()).orElse(null);
        if (family == null || family.getRevocationReason() == RefreshTokenFamilyRevocationReason.REUSED
                || family.getRevokedAt() != null) {
            return null;
        }

        RefreshToken current = repository.findByTokenHashForUpdate(tokenHash).orElse(null);
        if (current == null || !metadata.getFamilyId().equals(current.getFamilyId())) {
            return null;
        }

        OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        familyRepository.save(new RefreshTokenFamily(
                family.getId(), family.getUserId(), family.getCreatedAt(), family.getExpiresAt(),
                now, RefreshTokenFamilyRevocationReason.LOGOUT
        ));
        return null;
    }
}
