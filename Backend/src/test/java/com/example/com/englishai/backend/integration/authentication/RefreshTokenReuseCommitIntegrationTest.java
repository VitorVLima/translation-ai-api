package com.example.com.englishai.backend.integration.authentication;

import com.example.com.englishai.backend.application.authentication.RefreshAccessToken;
import com.example.com.englishai.backend.application.authentication.exception.RefreshTokenReuseException;
import com.example.com.englishai.backend.application.ports.RefreshTokenHasher;
import com.example.com.englishai.backend.application.ports.RefreshTokenTransaction;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenFamilyEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.RefreshTokenJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.RefreshTokenFamilyJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class RefreshTokenReuseCommitIntegrationTest {

    @Autowired
    private RefreshAccessToken refreshAccessToken;

    @Autowired
    private RefreshTokenHasher refreshTokenHasher;

    @Autowired
    private RefreshTokenTransaction refreshTokenTransaction;

    @Autowired
    private RefreshTokenJpaRepository refreshTokenRepository;

    @Autowired
    private RefreshTokenFamilyJpaRepository familyRepository;

    @Autowired
    private UserJpaRepository userRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private UUID userId;

    @AfterEach
    void cleanup() {
        if (userId != null) {
            new TransactionTemplate(transactionManager).executeWithoutResult(status -> userRepository.deleteById(userId));
        }
    }

    @Test
    void shouldCommitFamilyRevocationBeforeReuseExceptionEscapes() {
        UUID familyId = UUID.randomUUID();
        UUID rotatedId = UUID.randomUUID();
        UUID activeId = UUID.randomUUID();
        String rawToken = "reused-token-" + UUID.randomUUID();
        String tokenHash = refreshTokenHasher.hash(rawToken);
        OffsetDateTime now = OffsetDateTime.now();
        UserEntity user = saveUser();
        userId = user.getId();

        inTransaction(status -> familyRepository.save(new RefreshTokenFamilyEntity(
                familyId, userId, now.minusMinutes(2), now.plusDays(30), null
        )));

        inTransaction(status -> refreshTokenRepository.save(new RefreshTokenEntity(
                activeId, userId, familyId, "a".repeat(64),
                now.plusDays(30), now.minusMinutes(1), null, null
        )));
        inTransaction(status -> refreshTokenRepository.save(new RefreshTokenEntity(
                rotatedId, userId, familyId, tokenHash,
                now.plusDays(30), now.minusMinutes(2), now.minusMinutes(1), activeId
        )));

        assertThatThrownBy(() -> refreshAccessToken.execute(rawToken))
                .isInstanceOf(RefreshTokenReuseException.class);

        List<RefreshTokenEntity> family = inTransaction(status -> refreshTokenRepository
                .findAll().stream().filter(token -> token.getFamilyId().equals(familyId)).toList());
        assertThat(family).hasSize(2);
        assertThat(family).allMatch(token -> token.getRevokedAt() != null);
        RefreshTokenFamilyEntity persistedFamily = inTransaction(status -> familyRepository.findById(familyId).orElseThrow());
        assertThat(persistedFamily.getRevocationReason()).isEqualTo(RefreshTokenFamilyRevocationReason.REUSED);
    }

    @Test
    void shouldRollbackUnexpectedExceptionsInsideTransaction() {
        UUID familyId = UUID.randomUUID();
        UUID tokenId = UUID.randomUUID();
        UserEntity user = saveUser();
        userId = user.getId();
        RefreshTokenEntity token = new RefreshTokenEntity(
                tokenId, userId, familyId, "b".repeat(64),
                OffsetDateTime.now().plusDays(30), OffsetDateTime.now(), null, null
        );

        assertThatThrownBy(() -> refreshTokenTransaction.execute(repository -> {
            repository.save(new com.example.com.englishai.backend.domain.authentication.RefreshToken(
                    tokenId, userId, familyId, token.getTokenHash(), token.getExpiresAt(),
                    token.getCreatedAt(), null, null
            ));
            throw new IllegalStateException("unexpected");
        })).isInstanceOf(IllegalStateException.class);

        Optional<RefreshTokenEntity> persisted = inTransaction(status -> refreshTokenRepository.findById(tokenId));
        assertThat(persisted).isEmpty();
    }

    private UserEntity saveUser() {
        return inTransaction(status -> {
            OffsetDateTime now = OffsetDateTime.now();
            String unique = UUID.randomUUID().toString();
            return userRepository.save(new UserEntity(
                    UUID.randomUUID(), "reuse-" + unique + "@test.com", "reuse-" + unique,
                    "hash", now, now
            ));
        });
    }

    private <T> T inTransaction(java.util.function.Function<org.springframework.transaction.TransactionStatus, T> operation) {
        return new TransactionTemplate(transactionManager).execute(operation::apply);
    }
}
