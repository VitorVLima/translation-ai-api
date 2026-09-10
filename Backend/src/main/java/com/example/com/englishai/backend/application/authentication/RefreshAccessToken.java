package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.authentication.exception.InvalidRefreshTokenException;
import com.example.com.englishai.backend.application.authentication.exception.RefreshTokenReuseException;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenGenerator;
import com.example.com.englishai.backend.application.ports.RefreshTokenGenerator;
import com.example.com.englishai.backend.application.ports.RefreshTokenHasher;
import com.example.com.englishai.backend.application.ports.RefreshTokenFamilyRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenTransaction;
import com.example.com.englishai.backend.domain.authentication.RefreshToken;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamily;
import com.example.com.englishai.backend.domain.authentication.TokenRevocationReason;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.UUID;

public class RefreshAccessToken {

    private final RefreshTokenHasher refreshTokenHasher;
    private final RefreshTokenGenerator refreshTokenGenerator;
    private final AuthenticationTokenGenerator authenticationTokenGenerator;
    private final RefreshTokenFamilyRepository refreshTokenFamilyRepository;
    private final RefreshTokenTransaction refreshTokenTransaction;
    private final Duration refreshTokenExpiration;
    private final Clock clock;

    public RefreshAccessToken(
            RefreshTokenHasher refreshTokenHasher,
            RefreshTokenGenerator refreshTokenGenerator,
            AuthenticationTokenGenerator authenticationTokenGenerator,
            RefreshTokenFamilyRepository refreshTokenFamilyRepository,
            RefreshTokenTransaction refreshTokenTransaction,
            Duration refreshTokenExpiration,
            Clock clock
    ) {
        this.refreshTokenHasher = Objects.requireNonNull(refreshTokenHasher, "Refresh token hasher is required");
        this.refreshTokenGenerator = Objects.requireNonNull(refreshTokenGenerator, "Refresh token generator is required");
        this.authenticationTokenGenerator = Objects.requireNonNull(
                authenticationTokenGenerator, "Authentication token generator is required"
        );
        this.refreshTokenFamilyRepository = Objects.requireNonNull(
                refreshTokenFamilyRepository, "Refresh token family repository is required"
        );
        this.refreshTokenTransaction = Objects.requireNonNull(
                refreshTokenTransaction, "Refresh token transaction is required"
        );
        if (refreshTokenExpiration == null || refreshTokenExpiration.isZero() || refreshTokenExpiration.isNegative()) {
            throw new IllegalArgumentException("Refresh token expiration must be positive");
        }
        this.refreshTokenExpiration = refreshTokenExpiration;
        this.clock = Objects.requireNonNull(clock, "Clock is required");
    }

    public RefreshAccessToken(
            RefreshTokenHasher refreshTokenHasher,
            RefreshTokenGenerator refreshTokenGenerator,
            AuthenticationTokenGenerator authenticationTokenGenerator,
            RefreshTokenFamilyRepository refreshTokenFamilyRepository,
            RefreshTokenTransaction refreshTokenTransaction,
            long refreshTokenExpirationSeconds,
            Clock clock
    ) {
        this(
                refreshTokenHasher,
                refreshTokenGenerator,
                authenticationTokenGenerator,
                refreshTokenFamilyRepository,
                refreshTokenTransaction,
                Duration.ofSeconds(refreshTokenExpirationSeconds),
                clock
        );
    }

    public RefreshAccessTokenResult execute(String rawRefreshToken) {
        String tokenHash = refreshTokenHasher.hash(rawRefreshToken);
        RotationOutcome outcome = refreshTokenTransaction.execute(repository -> rotate(repository, tokenHash));
        if (outcome.reuseDetected()) {
            throw new RefreshTokenReuseException();
        }
        return outcome.result();
    }

    private RotationOutcome rotate(RefreshTokenRepository repository, String tokenHash) {
        RefreshToken metadata = repository.findByTokenHash(tokenHash)
                .orElseThrow(InvalidRefreshTokenException::new);
        OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        RefreshTokenFamily family = refreshTokenFamilyRepository.findByIdForUpdate(metadata.getFamilyId())
                .orElseThrow(InvalidRefreshTokenException::new);

        if (family.getRevokedAt() != null || family.getExpiresAt() == null
                || !family.getExpiresAt().isAfter(now)) {
            throw new InvalidRefreshTokenException();
        }

        RefreshToken current = repository.findByTokenHashForUpdate(tokenHash)
                .filter(token -> metadata.getFamilyId().equals(token.getFamilyId()))
                .orElseThrow(InvalidRefreshTokenException::new);

        if (current.getReplacedById() != null) {
            refreshTokenFamilyRepository.revoke(current.getFamilyId(), now,
                    RefreshTokenFamilyRevocationReason.REUSED);
            repository.revokeFamily(current.getFamilyId(), now);
            return RotationOutcome.reused();
        }
        if (current.getRevokedAt() != null || current.getExpiresAt() == null
                || !current.getExpiresAt().isAfter(now)) {
            throw new InvalidRefreshTokenException();
        }

        String newRawToken = refreshTokenGenerator.generate();
        String newTokenHash = refreshTokenHasher.hash(newRawToken);
        UUID newTokenId = UUID.randomUUID();
        RefreshToken rotatedCurrent = new RefreshToken(
                current.getId(),
                current.getUserId(),
                current.getFamilyId(),
                current.getTokenHash(),
                current.getExpiresAt(),
                current.getCreatedAt(),
                now,
                newTokenId,
                TokenRevocationReason.ROTATED
        );
        RefreshToken replacement = new RefreshToken(
                newTokenId,
                current.getUserId(),
                current.getFamilyId(),
                newTokenHash,
                now.plus(refreshTokenExpiration),
                now,
                null,
                null
        );

        repository.persistRotation(rotatedCurrent, replacement);
        String accessToken = authenticationTokenGenerator.generate(current.getUserId());
        return RotationOutcome.rotated(new RefreshAccessTokenResult(accessToken, newRawToken));
    }

    private record RotationOutcome(RefreshAccessTokenResult result, boolean reuseDetected) {

        private static RotationOutcome rotated(RefreshAccessTokenResult result) {
            return new RotationOutcome(result, false);
        }

        private static RotationOutcome reused() {
            return new RotationOutcome(null, true);
        }
    }
}
