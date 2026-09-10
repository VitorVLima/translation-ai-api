package com.example.com.englishai.backend.integration.authentication;

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
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class RefreshTokenReplacementForeignKeyIntegrationTest {

    @Autowired
    private UserJpaRepository userRepository;

    @Autowired
    private RefreshTokenFamilyJpaRepository familyRepository;

    @Autowired
    private RefreshTokenJpaRepository tokenRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final List<UUID> usersToDelete = new ArrayList<>();

    @AfterEach
    void cleanup() {
        inTransaction(status -> {
            usersToDelete.forEach(userRepository::deleteById);
            return null;
        });
        usersToDelete.clear();
    }

    @Test
    void shouldRejectDeletingReplacementAndPreserveHistoricalLink() {
        Fixture fixture = createFixture(true);

        assertThatThrownBy(() -> inNewTransaction(status -> {
            tokenRepository.deleteById(fixture.replacementId());
            tokenRepository.flush();
            return null;
        })).hasRootCauseInstanceOf(org.postgresql.util.PSQLException.class);

        RefreshTokenEntity predecessor = inTransaction(status ->
                tokenRepository.findById(fixture.predecessorId()).orElseThrow());
        assertThat(predecessor.getReplacedById()).isEqualTo(fixture.replacementId());
        Boolean replacementExists = inTransaction(status ->
                tokenRepository.findById(fixture.replacementId()).isPresent());
        assertThat(replacementExists).isTrue();
    }

    @Test
    void shouldAllowDeletingUnreferencedToken() {
        Fixture fixture = createFixture(false);

        inTransaction(status -> {
            tokenRepository.deleteById(fixture.replacementId());
            tokenRepository.flush();
            return null;
        });

        Boolean replacementExists = inTransaction(status ->
                tokenRepository.findById(fixture.replacementId()).isPresent());
        assertThat(replacementExists).isFalse();
    }

    @Test
    void shouldUseRestrictActionForReplacementForeignKey() {
        String deleteRule = jdbcTemplate.queryForObject("""
                SELECT rc.delete_rule
                  FROM information_schema.referential_constraints rc
                  JOIN information_schema.table_constraints tc
                    ON tc.constraint_catalog = rc.constraint_catalog
                   AND tc.constraint_schema = rc.constraint_schema
                   AND tc.constraint_name = rc.constraint_name
                 WHERE tc.table_name = 'refresh_tokens'
                   AND tc.constraint_name = 'fk_refresh_tokens_replaced_by'
                """, String.class);

        assertThat(deleteRule).isEqualTo("RESTRICT");
    }

    private Fixture createFixture(boolean linkReplacement) {
        return inTransaction(status -> {
            OffsetDateTime now = OffsetDateTime.now();
            String unique = UUID.randomUUID().toString();
            UserEntity user = userRepository.save(new UserEntity(
                    UUID.randomUUID(), "replacement-" + unique + "@test.com",
                    "replacement-" + unique, "hash", now, now));
            usersToDelete.add(user.getId());
            UUID familyId = UUID.randomUUID();
            familyRepository.save(new RefreshTokenFamilyEntity(
                    familyId, user.getId(), now, now.plusDays(30), null));
            UUID predecessorId = UUID.randomUUID();
            UUID replacementId = UUID.randomUUID();
            tokenRepository.save(new RefreshTokenEntity(
                    replacementId, user.getId(), familyId, hash('b'),
                    now.plusDays(30), now, null, null));
            tokenRepository.save(new RefreshTokenEntity(
                    predecessorId, user.getId(), familyId, hash('a'),
                    now.plusDays(30), now, now, linkReplacement ? replacementId : null));
            tokenRepository.flush();
            return new Fixture(predecessorId, replacementId);
        });
    }

    private String hash(char value) {
        return String.valueOf(value).repeat(64);
    }

    private <T> T inTransaction(java.util.function.Function<org.springframework.transaction.TransactionStatus, T> operation) {
        return new TransactionTemplate(transactionManager).execute(operation::apply);
    }

    private <T> T inNewTransaction(java.util.function.Function<org.springframework.transaction.TransactionStatus, T> operation) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return template.execute(operation::apply);
    }

    private record Fixture(UUID predecessorId, UUID replacementId) {}
}
