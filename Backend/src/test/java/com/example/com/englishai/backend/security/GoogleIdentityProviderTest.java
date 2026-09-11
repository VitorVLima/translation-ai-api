package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.application.authentication.exception.InvalidExternalIdentityException;
import com.example.com.englishai.backend.infrastructure.security.GoogleIdentityProvider;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GoogleIdentityProviderTest {
    private static final Instant NOW = Instant.parse("2026-09-11T12:00:00Z");
    private final RSAKey signingKey = generateKey("kid-1");
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    private final GoogleIdentityProvider provider = new GoogleIdentityProvider("client-id",
            source(signingKey), clock, Duration.ofSeconds(60));

    @Test
    void acceptsARealRs256SignedTokenWithExpectedClaimsAndNonce() throws Exception {
        var identity = provider.validate(token(signingKey, NOW, NOW.plusSeconds(300), "client-id", "nonce-1"), "nonce-1");
        assertThat(identity.subject()).isEqualTo("google-sub");
        assertThat(identity.email()).isEqualTo("person@example.com");
    }

    @Test
    void rejectsInvalidSignature() throws Exception {
        assertInvalid(token(generateKey("other"), NOW, NOW.plusSeconds(300), "client-id", "nonce-1"));
    }

    @Test
    void rejectsWrongIssuerAudienceExpiredAndFutureIat() throws Exception {
        assertInvalid(token(signingKey, NOW, NOW.plusSeconds(300), "other-client", "nonce-1"));
        assertInvalid(token(signingKey, "wrong-issuer", NOW, NOW.plusSeconds(300), "client-id", "nonce-1"));
        assertInvalid(token(signingKey, NOW.plusSeconds(61), NOW.plusSeconds(300), "client-id", "nonce-1"));
        assertInvalid(token(signingKey, NOW.minusSeconds(400), NOW.minusSeconds(1), "client-id", "nonce-1"));
    }

    @Test
    void rejectsMissingIatAndUnverifiedOrBlankIdentityClaims() throws Exception {
        var missingIat = new JWTClaimsSet.Builder().subject("google-sub")
                .issuer("https://accounts.google.com").audience("client-id")
                .expirationTime(Date.from(NOW.plusSeconds(300))).claim("email", "person@example.com")
                .claim("email_verified", true).claim("nonce", "nonce-1").build();
        assertInvalid(sign(signingKey, missingIat));

        assertInvalid(token(signingKey, NOW, NOW.plusSeconds(300), "client-id", "nonce-1", false));
        assertInvalid(token(signingKey, NOW, NOW.plusSeconds(300), "client-id", "nonce-1", true, "", "person@example.com"));
    }

    @Test
    void rejectsMissingOrIncorrectNonce() throws Exception {
        String token = token(signingKey, NOW, NOW.plusSeconds(300), "client-id", null);
        assertInvalid(token, "nonce-1");
        assertInvalid(token(signingKey, NOW, NOW.plusSeconds(300), "client-id", "other"), "nonce-1");
    }

    @Test
    void rejectsMalformedToken() {
        assertInvalid("not-a-jwt");
    }

    private void assertInvalid(String token) {
        assertThatThrownBy(() -> provider.validate(token, "nonce-1"))
                .isInstanceOf(InvalidExternalIdentityException.class);
    }

    private void assertInvalid(String token, String nonce) {
        assertThatThrownBy(() -> provider.validate(token, nonce))
                .isInstanceOf(InvalidExternalIdentityException.class);
    }

    private static JWKSource<SecurityContext> source(RSAKey key) {
        return new ImmutableJWKSet<>(new JWKSet(key.toPublicJWK()));
    }

    private static RSAKey generateKey(String kid) {
        try { return new RSAKeyGenerator(2048).keyID(kid).generate(); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static String token(RSAKey key, Instant iat, Instant exp, String audience, String nonce) throws Exception {
        return token(key, "https://accounts.google.com", iat, exp, audience, nonce, true, "google-sub", "person@example.com");
    }

    private static String token(RSAKey key, Instant iat, Instant exp, String audience, String nonce, boolean verified) throws Exception {
        return token(key, "https://accounts.google.com", iat, exp, audience, nonce, verified, "google-sub", "person@example.com");
    }

    private static String token(RSAKey key, Instant iat, Instant exp, String audience, String nonce,
                                boolean verified, String subject, String email) throws Exception {
        return token(key, "https://accounts.google.com", iat, exp, audience, nonce, verified, subject, email);
    }

    private static String token(RSAKey key, String issuer, Instant iat, Instant exp, String audience, String nonce) throws Exception {
        return token(key, issuer, iat, exp, audience, nonce, true, "google-sub", "person@example.com");
    }

    private static String token(RSAKey key, String issuer, Instant iat, Instant exp, String audience, String nonce,
                                boolean verified, String subject, String email) throws Exception {
        var builder = new JWTClaimsSet.Builder().subject(subject)
                .issuer(issuer).audience(audience)
                .issueTime(Date.from(iat)).expirationTime(Date.from(exp))
                .claim("email", email).claim("email_verified", verified);
        if (nonce != null) builder.claim("nonce", nonce);
        var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(), builder.build());
        jwt.sign(new RSASSASigner(key.toPrivateKey()));
        return jwt.serialize();
    }

    private static String sign(RSAKey key, JWTClaimsSet claims) throws Exception {
        var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(), claims);
        jwt.sign(new RSASSASigner(key.toPrivateKey()));
        return jwt.serialize();
    }
}
