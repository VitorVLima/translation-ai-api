package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.application.authentication.LoginResult;
import com.example.com.englishai.backend.application.authentication.RefreshAccessTokenResult;
import com.example.com.englishai.backend.domain.authentication.RefreshToken;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LoginRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LoginResponse;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LogoutRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.RefreshRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.TokenPairResponse;
import com.example.com.englishai.backend.presentation.rest.auth.dto.UserResponse;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SensitiveDataToStringTest {
    private static final String PASSWORD = "raw-password-secret";
    private static final String PASSWORD_HASH = "bcrypt-password-hash";
    private static final String ACCESS_TOKEN = "access-token-secret";
    private static final String REFRESH_TOKEN = "refresh-token-secret";
    private static final String TOKEN_HASH = "refresh-token-hash-secret";
    private final UUID userId = UUID.randomUUID();
    private final UUID familyId = UUID.randomUUID();
    private final OffsetDateTime now = OffsetDateTime.now();

    @Test
    void requestAndResponseToStringsRedactCredentialsAndTokens() {
        User user = new User(userId, "user@example.com", "user", PASSWORD_HASH, now, now);
        assertThat(new LoginRequest("user@example.com", PASSWORD).toString()).doesNotContain(PASSWORD);
        assertThat(new RefreshRequest(REFRESH_TOKEN).toString()).doesNotContain(REFRESH_TOKEN);
        assertThat(new LogoutRequest(REFRESH_TOKEN).toString()).doesNotContain(REFRESH_TOKEN);
        assertThat(new LoginResponse(UserResponse.from(user), ACCESS_TOKEN, REFRESH_TOKEN).toString())
                .doesNotContain(ACCESS_TOKEN, REFRESH_TOKEN, PASSWORD_HASH);
        assertThat(new TokenPairResponse(ACCESS_TOKEN, REFRESH_TOKEN).toString())
                .doesNotContain(ACCESS_TOKEN, REFRESH_TOKEN);
    }

    @Test
    void applicationResultsRedactTokens() {
        User user = new User(userId, "user@example.com", "user", PASSWORD_HASH, now, now);
        assertThat(new LoginResult(user, ACCESS_TOKEN, REFRESH_TOKEN).toString())
                .doesNotContain(ACCESS_TOKEN, REFRESH_TOKEN, PASSWORD_HASH);
        assertThat(new RefreshAccessTokenResult(ACCESS_TOKEN, REFRESH_TOKEN).toString())
                .doesNotContain(ACCESS_TOKEN, REFRESH_TOKEN);
    }

    @Test
    void domainAndPersistenceObjectsRedactHashes() {
        RefreshToken token = new RefreshToken(UUID.randomUUID(), userId, familyId, TOKEN_HASH,
                now.plusDays(1), now, now, UUID.randomUUID());
        RefreshTokenEntity entity = new RefreshTokenEntity(token.getId(), userId, familyId, TOKEN_HASH,
                token.getExpiresAt(), now, now, UUID.randomUUID());
        UserEntity user = new UserEntity(userId, "user@example.com", "user", PASSWORD_HASH, now, now);

        assertThat(token.toString()).doesNotContain(TOKEN_HASH);
        assertThat(entity.toString()).doesNotContain(TOKEN_HASH);
        assertThat(user.toString()).doesNotContain(PASSWORD_HASH);
    }
}
