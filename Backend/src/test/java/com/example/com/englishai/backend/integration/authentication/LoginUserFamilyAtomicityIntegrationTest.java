package com.example.com.englishai.backend.integration.authentication;

import com.example.com.englishai.backend.application.ports.RefreshTokenFamilyRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenTransaction;
import com.example.com.englishai.backend.domain.authentication.RefreshToken;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamily;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class LoginUserFamilyAtomicityIntegrationTest {

    @Autowired
    private RefreshTokenTransaction refreshTokenTransaction;

    @Autowired
    private RefreshTokenFamilyRepository familyRepository;

    @Autowired
    private RefreshTokenJpaRepository tokenJpaRepository;

    @Autowired
    private RefreshTokenFamilyJpaRepository familyJpaRepository;

    @Autowired
    private UserJpaRepository userRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private UUID userId;

    @AfterEach
    void cleanup() {
        if (userId != null) {
            inTransaction(status -> {
                userRepository.deleteById(userId);
                return null;
            });
        }
    }

    @Test
    void shouldRollbackFamilyWhenTokenPersistenceFails() {
        UserEntity user = saveUser();
        UUID existingFamilyId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        inTransaction(status -> familyJpaRepository.save(new RefreshTokenFamilyEntity(
                existingFamilyId, userId, now, now.plusDays(30), null
        )));
        inTransaction(status -> tokenJpaRepository.save(new RefreshTokenEntity(
                UUID.randomUUID(), userId, existingFamilyId, "d".repeat(64),
                now.plusDays(30), now, null, null
        )));

        UUID newFamilyId = UUID.randomUUID();
        RefreshTokenFamily newFamily = new RefreshTokenFamily(
                newFamilyId, userId, now, now.plusDays(30), null
        );
        RefreshToken duplicateToken = new RefreshToken(
                UUID.randomUUID(), userId, newFamilyId, "d".repeat(64),
                now.plusDays(30), now, null, null
        );

        assertThatThrownBy(() -> refreshTokenTransaction.execute(repository -> {
            familyRepository.save(newFamily);
            repository.save(duplicateToken);
            return null;
        })).isInstanceOf(DataIntegrityViolationException.class);

        Optional<RefreshTokenFamilyEntity> persisted = inTransaction(status ->
                familyJpaRepository.findById(newFamilyId));
        assertThat(persisted).isEmpty();
        assertThat(familyJpaRepository.findById(existingFamilyId)).isPresent();
    }

    private UserEntity saveUser() {
        return inTransaction(status -> {
            OffsetDateTime now = OffsetDateTime.now();
            String unique = UUID.randomUUID().toString();
            UserEntity user = userRepository.save(new UserEntity(
                    UUID.randomUUID(), "login-atomicity-" + unique + "@test.com", "login-atomicity-" + unique,
                    "hash", now, now
            ));
            userId = user.getId();
            return user;
        });
    }

    private <T> T inTransaction(
            java.util.function.Function<org.springframework.transaction.TransactionStatus, T> operation
    ) {
        return new TransactionTemplate(transactionManager).execute(operation::apply);
    }
}
