package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.ports.AuthenticationTokenGenerator;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.Objects;
import java.util.UUID;

public class JwtTokenGenerator implements AuthenticationTokenGenerator {

    private final MACSigner signer;
    private final Duration expiration;
    private final Clock clock;
    private final String issuer;
    private final String audience;

    public JwtTokenGenerator(String base64Secret, Duration expiration, Clock clock) {
        this(base64Secret, expiration, clock, JwtDefaults.ISSUER, JwtDefaults.AUDIENCE);
    }

    public JwtTokenGenerator(String base64Secret, Duration expiration, Clock clock,
                              String issuer, String audience) {
        byte[] key = JwtSecret.decode(base64Secret);
        if (expiration == null || expiration.getSeconds() < 1 || expiration.getNano() != 0) {
            throw new IllegalArgumentException("JWT expiration must be a positive whole number of seconds");
        }

        try {
            this.signer = new MACSigner(key);
        } catch (JOSEException exception) {
            throw new IllegalStateException("Unable to initialize JWT signer");
        }
        this.expiration = expiration;
        this.clock = Objects.requireNonNull(clock, "Clock is required");
        this.issuer = requireText(issuer, "JWT issuer");
        this.audience = requireText(audience, "JWT audience");
    }

    @Override
    public String generate(UUID userId) {
        Objects.requireNonNull(userId, "User ID is required");
        Instant issuedAt = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(userId.toString())
                .issuer(issuer)
                .audience(audience)
                .claim("token_type", "access")
                .issueTime(Date.from(issuedAt))
                .expirationTime(Date.from(issuedAt.plus(expiration)))
                .build();

        SignedJWT jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.HS256).type(JOSEObjectType.JWT).build(),
                claims
        );
        try {
            jwt.sign(signer);
            return jwt.serialize();
        } catch (JOSEException exception) {
            throw new IllegalStateException("Unable to generate authentication token");
        }
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " is required");
        return value;
    }
}
