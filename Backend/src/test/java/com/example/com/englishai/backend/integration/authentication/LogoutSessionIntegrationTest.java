package com.example.com.englishai.backend.integration.authentication;

import com.example.com.englishai.backend.application.authentication.LogoutSession;
import com.example.com.englishai.backend.application.authentication.RefreshAccessToken;
import com.example.com.englishai.backend.application.authentication.exception.InvalidRefreshTokenException;
import com.example.com.englishai.backend.application.ports.RefreshTokenHasher;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class LogoutSessionIntegrationTest {
    @Autowired private LogoutSession logoutSession;
    @Autowired private RefreshAccessToken refreshAccessToken;
    @Autowired private RefreshTokenHasher hasher;
    @Autowired private UserJpaRepository users;
    @Autowired private RefreshTokenFamilyJpaRepository families;
    @Autowired private RefreshTokenJpaRepository tokens;
    @Autowired private PlatformTransactionManager transactionManager;
    private final List<UUID> userIds = new ArrayList<>();

    @AfterEach
    void cleanup() {
        inTransaction(status -> { userIds.forEach(users::deleteById); return null; });
        userIds.clear();
    }

    @Test
    void shouldRevokeSessionAndRejectRefreshAfterLogout() {
        Fixture fixture = fixture("logout-" + UUID.randomUUID());

        logoutSession.execute(fixture.rawToken());

        RefreshTokenFamilyEntity family = inTransaction(status -> families.findById(fixture.familyId()).orElseThrow());
        assertThat(family.getRevokedAt()).isNotNull();
        assertThat(family.getRevocationReason()).isEqualTo(RefreshTokenFamilyRevocationReason.LOGOUT);
        assertThatThrownBy(() -> refreshAccessToken.execute(fixture.rawToken()))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void shouldKeepOtherSessionWorkingAndBeIdempotent() {
        Fixture first = fixture("first-" + UUID.randomUUID());
        Fixture second = fixture("second-" + UUID.randomUUID());

        logoutSession.execute(first.rawToken());
        logoutSession.execute(first.rawToken());

        assertThat(inTransaction(status -> families.findById(first.familyId()).orElseThrow()).getRevocationReason())
                .isEqualTo(RefreshTokenFamilyRevocationReason.LOGOUT);
        assertThat(inTransaction(status -> families.findById(second.familyId()).orElseThrow()).getRevokedAt())
                .isNull();
    }

    private Fixture fixture(String rawToken) {
        return inTransaction(status -> {
            OffsetDateTime now = OffsetDateTime.now();
            String unique = UUID.randomUUID().toString();
            UserEntity user = users.save(new UserEntity(UUID.randomUUID(), unique + "@test.com", unique, "hash", now, now));
            userIds.add(user.getId());
            UUID userId = user.getId();
            UUID familyId = UUID.randomUUID();
            families.save(new RefreshTokenFamilyEntity(familyId, userId, now, now.plusDays(30), null));
            tokens.save(new RefreshTokenEntity(UUID.randomUUID(), userId, familyId, hasher.hash(rawToken),
                    now.plusDays(30), now, null, null));
            return new Fixture(familyId, rawToken);
        });
    }

    private <T> T inTransaction(java.util.function.Function<org.springframework.transaction.TransactionStatus, T> operation) {
        return new TransactionTemplate(transactionManager).execute(operation::apply);
    }

    private record Fixture(UUID familyId, String rawToken) { }
}
