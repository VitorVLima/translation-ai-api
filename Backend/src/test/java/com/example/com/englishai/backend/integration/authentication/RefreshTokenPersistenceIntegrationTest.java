package com.example.com.englishai.backend.integration.authentication;

import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenFamilyEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.RefreshTokenJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.RefreshTokenFamilyJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.RefreshTokenRepositoryAdapter;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Transactional
class RefreshTokenPersistenceIntegrationTest {

    @Autowired
    private UserJpaRepository userRepository;

    @Autowired
    private RefreshTokenJpaRepository refreshTokenRepository;

    @Autowired
    private RefreshTokenFamilyJpaRepository familyRepository;

    @PersistenceContext
    private EntityManager entityManager;

    @Autowired
    private RefreshTokenRepositoryAdapter refreshTokenRepositoryAdapter;

    @Test
    void shouldPersistHashFamilyUserAndNullableRevocation() {
        UserEntity user = userRepository.save(user());
        UUID familyId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        familyRepository.save(new RefreshTokenFamilyEntity(
                familyId, user.getId(), now, now.plusDays(30), null
        ));
        RefreshTokenEntity token = refreshTokenRepository.save(new RefreshTokenEntity(
                UUID.randomUUID(), user.getId(), familyId, "a".repeat(64),
                now.plusDays(30), now, null, null
        ));

        RefreshTokenEntity persisted = refreshTokenRepository.findById(token.getId()).orElseThrow();

        assertThat(persisted.getUserId()).isEqualTo(user.getId());
        assertThat(persisted.getFamilyId()).isEqualTo(familyId);
        assertThat(persisted.getTokenHash()).isEqualTo("a".repeat(64));
        assertThat(persisted.getRevokedAt()).isNull();
    }

    @Test
    void shouldEnforceUniqueTokenHash() {
        UserEntity user = userRepository.save(user());
        OffsetDateTime now = OffsetDateTime.now();
        UUID familyId = UUID.randomUUID();
        familyRepository.save(new RefreshTokenFamilyEntity(
                familyId, user.getId(), now, now.plusDays(30), null
        ));
        String hash = "b".repeat(64);
        refreshTokenRepository.save(new RefreshTokenEntity(
                UUID.randomUUID(), user.getId(), familyId, hash,
                now.plusDays(30), now, null, null
        ));

        assertThatThrownBy(() -> refreshTokenRepository.saveAndFlush(new RefreshTokenEntity(
                UUID.randomUUID(), user.getId(), familyId, hash,
                now.plusDays(30), now, null, null
        ))).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void shouldReturnEmptyWhenLockedHashDoesNotExist() {
        assertThat(refreshTokenRepositoryAdapter.findByTokenHashForUpdate("c".repeat(64)))
                .isEmpty();
    }

    @Test
    void shouldEnforceFamilyUserForeignKey() {
        OffsetDateTime now = OffsetDateTime.now();

        assertThatThrownBy(() -> familyRepository.saveAndFlush(new RefreshTokenFamilyEntity(
                UUID.randomUUID(), UUID.randomUUID(), now, now.plusDays(30), null
        ))).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void shouldEnforceRefreshTokenFamilyForeignKey() {
        UserEntity user = userRepository.save(user());
        OffsetDateTime now = OffsetDateTime.now();

        assertThatThrownBy(() -> refreshTokenRepository.saveAndFlush(new RefreshTokenEntity(
                UUID.randomUUID(), user.getId(), UUID.randomUUID(), "c".repeat(64),
                now.plusDays(30), now, null, null
        ))).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void shouldCascadeDeleteFamilyAndTokensWhenUserIsDeleted() {
        UserEntity user = userRepository.save(user());
        UUID familyId = UUID.randomUUID();
        UUID tokenId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        familyRepository.save(new RefreshTokenFamilyEntity(
                familyId, user.getId(), now, now.plusDays(30), null
        ));
        refreshTokenRepository.save(new RefreshTokenEntity(
                tokenId, user.getId(), familyId, "d".repeat(64),
                now.plusDays(30), now, null, null
        ));
        refreshTokenRepository.flush();

        userRepository.deleteById(user.getId());
        userRepository.flush();
        entityManager.clear();

        assertThat(familyRepository.findById(familyId)).isEmpty();
        assertThat(refreshTokenRepository.findById(tokenId)).isEmpty();
    }

    private UserEntity user() {
        OffsetDateTime now = OffsetDateTime.now();
        String unique = UUID.randomUUID().toString();
        return new UserEntity(
                UUID.randomUUID(), "refresh-" + unique + "@test.com", "refresh-" + unique,
                "hash", now, now
        );
    }
}
