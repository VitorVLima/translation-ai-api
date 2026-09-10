package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.security.JwtTokenGenerator;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtTokenGeneratorTest {

    private final byte[] key = randomKey();
    private final String secret = Base64.getEncoder().encodeToString(key);
    private final Instant now = Instant.parse("2026-09-09T12:00:00Z");
    private final Clock clock = Clock.fixed(now, ZoneOffset.UTC);

    @Test
    void shouldGenerateSignedTokenWithOnlyUserIdAndTimestamps() throws Exception {
        UUID userId = UUID.randomUUID();
        JwtTokenGenerator generator = new JwtTokenGenerator(secret, Duration.ofMinutes(15), clock);

        SignedJWT token = SignedJWT.parse(generator.generate(userId));

        assertThat(token.getHeader().getAlgorithm()).isEqualTo(JWSAlgorithm.HS256);
        assertThat(token.getHeader().getType()).isEqualTo(JOSEObjectType.JWT);
        assertThat(token.verify(new MACVerifier(key))).isTrue();
        assertThat(token.getJWTClaimsSet().getSubject()).isEqualTo(userId.toString());
        assertThat(token.getJWTClaimsSet().getIssueTime().toInstant()).isEqualTo(now);
        assertThat(token.getJWTClaimsSet().getExpirationTime().toInstant()).isEqualTo(now.plusSeconds(900));
        assertThat(token.getJWTClaimsSet().getStringClaim("token_type")).isEqualTo("access");
        assertThat(token.getJWTClaimsSet().getClaims()).containsOnlyKeys("sub", "token_type", "iat", "exp");
    }

    @Test
    void shouldUseConfiguredExpiration() throws Exception {
        JwtTokenGenerator generator = new JwtTokenGenerator(secret, Duration.ofSeconds(60), clock);

        SignedJWT token = SignedJWT.parse(generator.generate(UUID.randomUUID()));

        assertThat(token.getJWTClaimsSet().getExpirationTime().toInstant()).isEqualTo(now.plusSeconds(60));
    }

    @Test
    void shouldNotVerifyWithAnotherKey() throws Exception {
        JwtTokenGenerator generator = new JwtTokenGenerator(secret, Duration.ofMinutes(15), clock);

        SignedJWT token = SignedJWT.parse(generator.generate(UUID.randomUUID()));

        assertThat(token.verify(new MACVerifier(randomKey()))).isFalse();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "not-base64!", "c2hvcnQ="})
    void shouldRejectInvalidSecret(String invalidSecret) {
        assertThatThrownBy(() -> new JwtTokenGenerator(invalidSecret, Duration.ofMinutes(15), clock))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(longs = {0, -1})
    void shouldRejectNonPositiveExpiration(long seconds) {
        assertThatThrownBy(() -> new JwtTokenGenerator(secret, Duration.ofSeconds(seconds), clock))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("JWT expiration must be a positive whole number of seconds");
    }

    @Test
    void shouldRejectMissingUserId() {
        JwtTokenGenerator generator = new JwtTokenGenerator(secret, Duration.ofMinutes(15), clock);

        assertThatThrownBy(() -> generator.generate(null))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("User ID is required");
    }

    private static byte[] randomKey() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return key;
    }
}
