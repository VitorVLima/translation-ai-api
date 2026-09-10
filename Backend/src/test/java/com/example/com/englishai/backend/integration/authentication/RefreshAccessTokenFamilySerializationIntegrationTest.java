package com.example.com.englishai.backend.integration.authentication;

import com.example.com.englishai.backend.application.authentication.RefreshAccessToken;
import com.example.com.englishai.backend.application.authentication.RefreshAccessTokenResult;
import com.example.com.englishai.backend.domain.authentication.TokenRevocationReason;
import com.example.com.englishai.backend.application.authentication.exception.InvalidRefreshTokenException;
import com.example.com.englishai.backend.application.ports.RefreshTokenHasher;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenFamilyEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.RefreshTokenFamilyJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.RefreshTokenJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class RefreshAccessTokenFamilySerializationIntegrationTest {

    @Autowired
    private RefreshAccessToken refreshAccessToken;

    @Autowired
    private RefreshTokenHasher hasher;

    @Autowired
    private RefreshTokenJpaRepository tokenRepository;

    @Autowired
    private RefreshTokenFamilyJpaRepository familyRepository;

    @Autowired
    private UserJpaRepository userRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final List<UUID> usersToDelete = new ArrayList<>();

    @AfterEach
    void cleanup() {
        jdbcTemplate.execute("DROP TRIGGER IF EXISTS test_replacement_exists_before_link ON refresh_tokens");
        jdbcTemplate.execute("DROP FUNCTION IF EXISTS test_replacement_exists_before_link()");
        inTransaction(status -> {
            usersToDelete.forEach(userRepository::deleteById);
            return null;
        });
        usersToDelete.clear();
    }

    @Test
    void shouldInsertReplacementBeforeUpdatingPreviousToken() {
        UserEntity user = saveUser();
        UUID familyId = UUID.randomUUID();
        String rawToken = "trigger-order-token-" + UUID.randomUUID();
        saveFamilyAndToken(user.getId(), familyId, rawToken);

        jdbcTemplate.execute("""
                CREATE OR REPLACE FUNCTION test_replacement_exists_before_link()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    IF NEW.replaced_by_id IS NOT NULL
                       AND NOT EXISTS (SELECT 1 FROM refresh_tokens WHERE id = NEW.replaced_by_id) THEN
                        RAISE EXCEPTION 'replacement must exist before previous token is linked';
                    END IF;
                    RETURN NEW;
                END;
                $$
                """);
        jdbcTemplate.execute("""
                CREATE TRIGGER test_replacement_exists_before_link
                BEFORE UPDATE OF replaced_by_id ON refresh_tokens
                FOR EACH ROW EXECUTE FUNCTION test_replacement_exists_before_link()
                """);

        RefreshAccessTokenResult result = refreshAccessToken.execute(rawToken);

        assertThat(result.refreshToken()).isNotBlank();
        assertThat(tokensOf(familyId)).hasSize(2);
        assertThat(tokensOf(familyId)).filteredOn(token -> token.getRevokedAt() == null).hasSize(1);
    }

    @Test
    void shouldRotateOnlyOnceWhenSameRefreshTokenIsUsedConcurrently() throws Exception {
        UserEntity user = saveUser();
        UUID familyId = UUID.randomUUID();
        String rawToken = "same-refresh-token-" + UUID.randomUUID();
        saveFamilyAndToken(user.getId(), familyId, rawToken);

        List<Throwable> failures = runConcurrently(
                () -> refreshAccessToken.execute(rawToken),
                () -> refreshAccessToken.execute(rawToken)
        );

        assertThat(failures).hasSize(1)
                .allMatch(error -> error instanceof InvalidRefreshTokenException);
        List<RefreshTokenEntity> tokens = tokensOf(familyId);
        assertThat(tokens).hasSize(2);
        assertThat(tokens).filteredOn(token -> token.getRevokedAt() == null).isEmpty();
        assertThat(tokens).anyMatch(token -> token.getRevocationReason() == TokenRevocationReason.ROTATED);
    }

    @Test
    void shouldRejectTokenWhenFamilyWasRevoked() {
        UserEntity user = saveUser();
        UUID familyId = UUID.randomUUID();
        String rawToken = "revoked-family-token-" + UUID.randomUUID();
        saveFamilyAndToken(user.getId(), familyId, rawToken);
        OffsetDateTime revokedAt = OffsetDateTime.now();
        inTransaction(status -> {
            familyRepository.revokeById(familyId, revokedAt);
            return null;
        });

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> refreshAccessToken.execute(rawToken))
                .isInstanceOf(InvalidRefreshTokenException.class);
        assertThat(tokensOf(familyId)).allMatch(token -> token.getRevokedAt() == null);
    }

    @Test
    void shouldRotateTokensFromDifferentFamiliesIndependently() throws Exception {
        UserEntity firstUser = saveUser();
        UserEntity secondUser = saveUser();
        UUID firstFamilyId = UUID.randomUUID();
        UUID secondFamilyId = UUID.randomUUID();
        String firstRawToken = "first-family-token-" + UUID.randomUUID();
        String secondRawToken = "second-family-token-" + UUID.randomUUID();
        saveFamilyAndToken(firstUser.getId(), firstFamilyId, firstRawToken);
        saveFamilyAndToken(secondUser.getId(), secondFamilyId, secondRawToken);

        List<Throwable> failures = runConcurrently(
                () -> refreshAccessToken.execute(firstRawToken),
                () -> refreshAccessToken.execute(secondRawToken)
        );

        assertThat(failures).isEmpty();
        assertThat(tokensOf(firstFamilyId)).hasSize(2);
        assertThat(tokensOf(secondFamilyId)).hasSize(2);
    }

    private List<Throwable> runConcurrently(Callable<RefreshAccessTokenResult> first,
                                            Callable<RefreshAccessTokenResult> second) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            var futures = executor.invokeAll(List.of(first, second));
            List<Throwable> failures = new ArrayList<>();
            for (var future : futures) {
                try {
                    future.get();
                } catch (ExecutionException exception) {
                    failures.add(exception.getCause());
                }
            }
            return failures;
        } finally {
            executor.shutdownNow();
        }
    }

    private UserEntity saveUser() {
        return inTransaction(status -> {
            OffsetDateTime now = OffsetDateTime.now();
            String unique = UUID.randomUUID().toString();
            UserEntity user = userRepository.save(new UserEntity(
                    UUID.randomUUID(), "refresh-family-" + unique + "@test.com", "refresh-family-" + unique,
                    "hash", now, now
            ));
            usersToDelete.add(user.getId());
            return user;
        });
    }

    private void saveFamilyAndToken(UUID userId, UUID familyId, String rawToken) {
        inTransaction(status -> {
            OffsetDateTime now = OffsetDateTime.now();
            familyRepository.save(new RefreshTokenFamilyEntity(
                    familyId, userId, now, now.plusDays(30), null
            ));
            tokenRepository.save(new RefreshTokenEntity(
                    UUID.randomUUID(), userId, familyId, hasher.hash(rawToken),
                    now.plusDays(30), now, null, null
            ));
            return null;
        });
    }

    private List<RefreshTokenEntity> tokensOf(UUID familyId) {
        return inTransaction(status -> tokenRepository.findAll().stream()
                .filter(token -> token.getFamilyId().equals(familyId)).toList());
    }

    private <T> T inTransaction(
            java.util.function.Function<org.springframework.transaction.TransactionStatus, T> operation
    ) {
        return new TransactionTemplate(transactionManager).execute(operation::apply);
    }
}
