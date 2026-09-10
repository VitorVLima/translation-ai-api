package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.security.HmacRefreshTokenHasher;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class HmacRefreshTokenHasherTest {

    private static final String SECRET = Base64.getEncoder().encodeToString(new byte[32]);
    private static final String OTHER_SECRET = Base64.getEncoder().encodeToString(new byte[]{
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
            17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32
    });

    @Test
    void shouldDeriveDeterministicHmac() {
        HmacRefreshTokenHasher hasher = new HmacRefreshTokenHasher(SECRET);

        assertThat(hasher.hash("refresh-token")).isEqualTo(hasher.hash("refresh-token"));
        assertThat(hasher.hash("refresh-token")).hasSize(64);
    }

    @Test
    void shouldDeriveDifferentHashesForDifferentTokens() {
        HmacRefreshTokenHasher hasher = new HmacRefreshTokenHasher(SECRET);

        assertThat(hasher.hash("refresh-token-1")).isNotEqualTo(hasher.hash("refresh-token-2"));
    }

    @Test
    void shouldDeriveDifferentHashesForDifferentKeys() {
        String token = "refresh-token";

        assertThat(new HmacRefreshTokenHasher(SECRET).hash(token))
                .isNotEqualTo(new HmacRefreshTokenHasher(OTHER_SECRET).hash(token));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void shouldRejectMissingToken(String token) {
        HmacRefreshTokenHasher hasher = new HmacRefreshTokenHasher(SECRET);

        assertThatIllegalArgumentException().isThrownBy(() -> hasher.hash(token));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"not-base64"})
    void shouldRejectInvalidOrMissingSecret(String secret) {
        assertThatIllegalArgumentException().isThrownBy(() -> new HmacRefreshTokenHasher(secret));
    }

    @Test
    void shouldRejectSecretShorterThanMinimum() {
        String shortSecret = Base64.getEncoder().encodeToString(new byte[31]);

        assertThatIllegalArgumentException().isThrownBy(() -> new HmacRefreshTokenHasher(shortSecret));
    }
}
