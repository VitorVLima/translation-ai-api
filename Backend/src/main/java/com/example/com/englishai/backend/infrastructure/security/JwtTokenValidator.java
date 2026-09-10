package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.authentication.exception.InvalidAuthenticationTokenException;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import java.text.ParseException;
import java.time.Clock;
import java.util.Date;
import java.util.Objects;
import java.util.UUID;

public class JwtTokenValidator implements AuthenticationTokenValidator {

    private final MACVerifier verifier;
    private final Clock clock;

    public JwtTokenValidator(String base64Secret, Clock clock) {
        byte[] key = JwtSecret.decode(base64Secret);
        try {
            this.verifier = new MACVerifier(key);
        } catch (JOSEException exception) {
            throw new IllegalStateException("Unable to initialize JWT verifier");
        }
        this.clock = Objects.requireNonNull(clock, "Clock is required");
    }

    @Override
    public UUID validateAndGetUserId(String token) {
        if (token == null || token.isBlank()) {
            throw new InvalidAuthenticationTokenException();
        }

        try {
            SignedJWT jwt = SignedJWT.parse(token);
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm()) || !jwt.verify(verifier)) {
                throw new InvalidAuthenticationTokenException();
            }

            JWTClaimsSet claims = jwt.getJWTClaimsSet();
            if (!"access".equals(claims.getStringClaim("token_type"))) {
                throw new InvalidAuthenticationTokenException();
            }
            Date expiration = claims.getExpirationTime();
            if (expiration == null || !expiration.toInstant().isAfter(clock.instant())) {
                throw new InvalidAuthenticationTokenException();
            }

            String subject = claims.getSubject();
            if (subject == null) {
                throw new InvalidAuthenticationTokenException();
            }
            UUID userId = UUID.fromString(subject);
            if (!userId.toString().equalsIgnoreCase(subject)) {
                throw new InvalidAuthenticationTokenException();
            }
            return userId;
        } catch (ParseException | JOSEException | IllegalArgumentException exception) {
            throw new InvalidAuthenticationTokenException();
        }
    }
}
