package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.application.authentication.exception.InvalidAuthenticationTokenException;
import com.example.com.englishai.backend.infrastructure.security.JwtTokenGenerator;
import com.example.com.englishai.backend.infrastructure.security.JwtTokenValidator;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
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
import java.util.Date;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtTokenValidatorTest {

    private final byte[] key = randomKey();
    private final String secret = Base64.getEncoder().encodeToString(key);
    private final Instant now = Instant.parse("2026-09-09T12:00:00Z");
    private final Clock clock = Clock.fixed(now, ZoneOffset.UTC);
    private final UUID userId = UUID.randomUUID();
    private final JwtTokenValidator validator = new JwtTokenValidator(secret, clock);
    private static final String ISSUER = "englishai";
    private static final String AUDIENCE = "englishai-api";

    @Test
    void shouldAcceptGeneratedTokenAndExtractExactUserId() {
        String token = new JwtTokenGenerator(secret, Duration.ofMinutes(15), clock).generate(userId);

        assertThat(validator.validateAndGetUserId(token)).isEqualTo(userId);
    }

    @Test
    void shouldAcceptConfiguredIssuerAndAudience() {
        JwtTokenValidator custom = new JwtTokenValidator(secret, clock, Duration.ofSeconds(60), "custom-issuer", "custom-api");
        String token = new JwtTokenGenerator(secret, Duration.ofMinutes(15), clock, "custom-issuer", "custom-api").generate(userId);
        assertThat(custom.validateAndGetUserId(token)).isEqualTo(userId);
    }

    @Test
    void shouldRejectMissingIssuerOrAudience() throws Exception {
        assertInvalid(sign(new JWTClaimsSet.Builder().subject(userId.toString())
                .claim("token_type", "access").issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(60))).build(), JWSAlgorithm.HS256));
    }

    @Test
    void shouldRejectWrongIssuerOrAudience() throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder().subject(userId.toString())
                .issuer("wrong").audience("other-api").claim("token_type", "access")
                .issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(60))).build();
        assertInvalid(sign(claims, JWSAlgorithm.HS256));
    }

    @Test
    void shouldAcceptIssueTimeExactlyAtConfiguredSkew() throws Exception {
        JwtTokenValidator defaultSkew = new JwtTokenValidator(secret, clock);
        assertThat(defaultSkew.validateAndGetUserId(sign(new JWTClaimsSet.Builder(validClaims())
                .issueTime(Date.from(now.plusSeconds(60))).build(), JWSAlgorithm.HS256))).isEqualTo(userId);
    }

    @Test
    void shouldRejectIssueTimeBeyondConfiguredSkew() throws Exception {
        JwtTokenValidator skewed = new JwtTokenValidator(secret, clock, Duration.ofSeconds(60));
        assertInvalidWith(skewed, sign(new JWTClaimsSet.Builder(validClaims())
                .issueTime(Date.from(now.plusSeconds(61))).build(), JWSAlgorithm.HS256));
    }

    @Test
    void shouldRejectNegativeClockSkew() {
        assertThatThrownBy(() -> new JwtTokenValidator(secret, clock, Duration.ofSeconds(-1)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void shouldRejectMissingIssueTime() throws Exception {
        assertInvalid(sign(new JWTClaimsSet.Builder()
                .subject(userId.toString()).claim("token_type", "access")
                .expirationTime(Date.from(now.plusSeconds(60))).build(), JWSAlgorithm.HS256));
    }

    @Test
    void shouldRejectMalformedIssueTime() throws Exception {
        assertInvalid(sign(new JWTClaimsSet.Builder(validClaims())
                .claim("iat", "not-a-date").build(), JWSAlgorithm.HS256));
    }

    @Test
    void shouldRejectSignatureFromAnotherKey() {
        String otherSecret = Base64.getEncoder().encodeToString(randomKey());
        String token = new JwtTokenGenerator(otherSecret, Duration.ofMinutes(15), clock).generate(userId);

        assertInvalid(token);
    }

    @ParameterizedTest
    @ValueSource(longs = {-1, 0})
    void shouldRejectExpiredTokenIncludingExactExpirationInstant(long seconds) throws Exception {
        String token = sign(new JWTClaimsSet.Builder()
                .subject(userId.toString())
                .issuer(ISSUER)
                .audience(AUDIENCE)
                .claim("token_type", "access")
                .expirationTime(Date.from(now.plusSeconds(seconds)))
                .build(), JWSAlgorithm.HS256);

        assertInvalid(token);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "not-a-token", "a.b.c"})
    void shouldRejectMalformedToken(String token) {
        assertInvalid(token);
    }

    @Test
    void shouldRejectMissingExpiration() throws Exception {
        assertInvalid(sign(new JWTClaimsSet.Builder().subject(userId.toString()).claim("token_type", "access").build(), JWSAlgorithm.HS256));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"not-a-uuid", "1-1-1-1-1"})
    void shouldRejectMissingOrInvalidSubject(String subject) throws Exception {
        assertInvalid(sign(new JWTClaimsSet.Builder()
                .subject(subject)
                .claim("token_type", "access")
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(60)))
                .build(), JWSAlgorithm.HS256));
    }

    @Test
    void shouldRejectUnexpectedAlgorithmEvenWithValidSignature() throws Exception {
        assertInvalid(sign(validClaims(), JWSAlgorithm.HS384));
    }

    @Test
    void shouldRejectTokenWithoutType() throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(userId.toString())
                .expirationTime(Date.from(now.plusSeconds(60)))
                .build();

        assertInvalid(sign(claims, JWSAlgorithm.HS256));
    }

    @Test
    void shouldRejectRefreshTokenType() throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(userId.toString())
                .claim("token_type", "refresh")
                .expirationTime(Date.from(now.plusSeconds(60)))
                .build();

        assertInvalid(sign(claims, JWSAlgorithm.HS256));
    }

    @Test
    void shouldRejectTokenWithAdulteratedType() throws Exception {
        String accessToken = sign(validClaims(), JWSAlgorithm.HS256);
        SignedJWT parsed = SignedJWT.parse(accessToken);
        JWTClaimsSet adulteratedClaims = new JWTClaimsSet.Builder(parsed.getJWTClaimsSet())
                .claim("token_type", "refresh")
                .build();
        SignedJWT adulterated = new SignedJWT(parsed.getHeader(), adulteratedClaims);

        String[] parts = accessToken.split("\\.");
        assertInvalid(parts[0] + "."
                + adulterated.getPayload().toString() + "."
                + parts[2]);
    }

    @Test
    void shouldRejectUnsignedToken() {
        assertInvalid(new PlainJWT(validClaims()).serialize());
    }

    @Test
    void shouldRejectAlteredPayload() throws Exception {
        String token = sign(validClaims(), JWSAlgorithm.HS256);
        String[] parts = token.split("\\.");
        SignedJWT changed = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256),
                new JWTClaimsSet.Builder(validClaims()).subject(UUID.randomUUID().toString()).build());

        assertInvalid(parts[0] + "." + changed.getPayload().toBase64URL() + "." + parts[2]);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "invalid!", "c2hvcnQ="})
    void shouldRejectInvalidConfiguredKey(String invalidSecret) {
        assertThatThrownBy(() -> new JwtTokenValidator(invalidSecret, clock))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private JWTClaimsSet validClaims() {
        return new JWTClaimsSet.Builder()
                .subject(userId.toString())
                .issuer(ISSUER)
                .audience(AUDIENCE)
                .claim("token_type", "access")
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(60)))
                .build();
    }

    private String sign(JWTClaimsSet claims, JWSAlgorithm algorithm) throws Exception {
        SignedJWT token = new SignedJWT(new JWSHeader(algorithm), claims);
        token.sign(new MACSigner(key));
        return token.serialize();
    }

    private void assertInvalid(String token) {
        assertThatThrownBy(() -> validator.validateAndGetUserId(token))
                .isInstanceOf(InvalidAuthenticationTokenException.class)
                .hasMessage("Invalid or expired authentication token")
                .hasNoCause();
    }

    private void assertInvalidWith(JwtTokenValidator validator, String token) {
        assertThatThrownBy(() -> validator.validateAndGetUserId(token))
                .isInstanceOf(InvalidAuthenticationTokenException.class)
                .hasMessage("Invalid or expired authentication token")
                .hasNoCause();
    }

    private static byte[] randomKey() {
        byte[] key = new byte[64];
        new SecureRandom().nextBytes(key);
        return key;
    }
}
