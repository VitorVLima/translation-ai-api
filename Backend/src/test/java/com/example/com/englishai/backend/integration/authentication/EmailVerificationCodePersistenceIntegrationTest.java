package com.example.com.englishai.backend.integration.authentication;

import com.example.com.englishai.backend.infrastructure.persistence.entity.EmailVerificationCodeEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.EmailVerificationCodeJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class EmailVerificationCodePersistenceIntegrationTest {
    @Autowired private UserJpaRepository users;
    @Autowired private EmailVerificationCodeJpaRepository codes;
    @Autowired private EntityManager entityManager;

    @Test
    void shouldPersistCodeMetadataAndCascadeWhenUserIsRemoved() {
        UUID userId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        users.save(new UserEntity(userId, "verify-" + userId + "@test.com", "verify-" + userId,
                "bcrypt-hash", now, now, false));
        UUID codeId = UUID.randomUUID();
        codes.saveAndFlush(new EmailVerificationCodeEntity(codeId, userId, "a".repeat(64), now,
                now.plusMinutes(10), null, 0, 5));

        assertThat(codes.findById(codeId)).isPresent();
        assertThat(codes.findById(codeId).orElseThrow().getCodeHash()).isEqualTo("a".repeat(64));

        users.deleteById(userId);
        users.flush();
        entityManager.clear();
        assertThat(codes.findById(codeId)).isEmpty();
    }
}
