package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.authentication.exception.InvalidExternalIdentityException;
import com.example.com.englishai.backend.application.ports.ExternalIdentityProvider;
import com.example.com.englishai.backend.domain.authentication.ExternalAuthProvider;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.factories.DefaultJWSVerifierFactory;
import com.nimbusds.jose.jwk.source.DefaultJWKSetCache;
import com.nimbusds.jose.jwk.source.JWKSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.nimbusds.jose.jwk.source.RemoteJWKSet;
import com.nimbusds.jose.proc.*;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.proc.ConfigurableJWTProcessor;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import com.nimbusds.jwt.proc.JWTClaimsSetVerifier;
import com.nimbusds.jwt.proc.BadJWTException;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.source.JWKSetCache;
import java.net.URL;
import java.time.Instant;
import java.util.Date;
import java.time.Clock;
import java.time.Duration;
import com.nimbusds.jose.jwk.source.JWKSource;

public class GoogleIdentityProvider implements ExternalIdentityProvider {
    private static final String GOOGLE_ISSUER = "https://accounts.google.com";
    private static final Logger log = LoggerFactory.getLogger(GoogleIdentityProvider.class);
    private final ConfigurableJWTProcessor<SecurityContext> processor;
    private final Clock clock;
    private final Duration skew;

    public GoogleIdentityProvider(String clientId) {
        try {
            JWKSource<SecurityContext> keys = new RemoteJWKSet<>(new URL("https://www.googleapis.com/oauth2/v3/certs"));
            this.clock = Clock.systemUTC(); this.skew = Duration.ofSeconds(60);
            var p = new DefaultJWTProcessor<SecurityContext>();
            p.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, keys));
            p.setJWTClaimsSetVerifier(new ClaimsVerifier(clientId));
            this.processor = p;
        } catch (Exception e) {
            throw new IllegalArgumentException("Unable to configure Google identity provider", e);
        }
    }

    public GoogleIdentityProvider(String clientId, JWKSource<SecurityContext> keys, Clock clock, Duration skew) {
        if (clientId == null || clientId.isBlank() || clock == null || skew.isNegative()) throw new IllegalArgumentException("Invalid Google configuration");
        this.clock = clock; this.skew = skew;
        var p = new DefaultJWTProcessor<SecurityContext>();
        p.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, keys));
        p.setJWTClaimsSetVerifier(new ClaimsVerifier(clientId, clock, skew));
        this.processor = p;
    }

    @Override
    public ValidatedExternalIdentity validate(String credential) {
        if (credential == null || credential.isBlank()) throw new InvalidExternalIdentityException();
        try {
            JWTClaimsSet claims = processor.process(credential, null);
            String subject = claims.getSubject();
            String email = claims.getStringClaim("email");
            Boolean verified = claims.getBooleanClaim("email_verified");
            if (subject == null || email == null || !Boolean.TRUE.equals(verified)) throw new InvalidExternalIdentityException();
            return new ValidatedExternalIdentity(ExternalAuthProvider.GOOGLE, subject, email, true,
                    claims.getStringClaim("name"));
        } catch (InvalidExternalIdentityException e) { throw e; }
        catch (Exception e) { throw new InvalidExternalIdentityException(); }
    }

    @Override
    public ValidatedExternalIdentity validate(String credential, String nonce) {
        if (nonce == null || nonce.isBlank()) { debug("GOOGLE_NONCE_MISSING"); throw new InvalidExternalIdentityException(); }
        try {
            JWTClaimsSet claims = processor.process(credential, null);
            if (claims.getStringClaim("nonce") == null) { debug("GOOGLE_NONCE_MISSING"); throw new InvalidExternalIdentityException(); }
            if (!nonce.equals(claims.getStringClaim("nonce"))) { debug("GOOGLE_NONCE_MISMATCH"); throw new InvalidExternalIdentityException(); }
            String subject = claims.getSubject(); String email = claims.getStringClaim("email");
            Boolean verified = claims.getBooleanClaim("email_verified");
            if (subject == null || subject.isBlank()) { debug("GOOGLE_SUB_MISSING"); throw new InvalidExternalIdentityException(); }
            if (email == null || email.isBlank()) { debug("GOOGLE_EMAIL_MISSING"); throw new InvalidExternalIdentityException(); }
            if (!Boolean.TRUE.equals(verified)) { debug("GOOGLE_EMAIL_NOT_VERIFIED"); throw new InvalidExternalIdentityException(); }
            return new ValidatedExternalIdentity(ExternalAuthProvider.GOOGLE, subject, email, true, claims.getStringClaim("name"));
        } catch (InvalidExternalIdentityException e) { throw e; }
        catch (BadJWTException e) { debug(e.getMessage()); throw new InvalidExternalIdentityException(); }
        catch (Exception e) { debug(category(e)); throw new InvalidExternalIdentityException(); }
    }

    private static void debug(String category) { log.debug("Google identity validation rejected: {}", category); }

    private static String category(Exception e) {
        String type = e.getClass().getSimpleName();
        if (type.contains("RemoteKey") || type.contains("ResourceRetriever")) return "GOOGLE_JWKS_ERROR";
        if (type.contains("Parse") || type.contains("JOSE") || type.contains("JWS") || type.contains("BadJWS")) return "GOOGLE_TOKEN_MALFORMED_OR_SIGNATURE_INVALID";
        return "GOOGLE_TOKEN_INVALID";
    }

    private static final class ClaimsVerifier implements JWTClaimsSetVerifier<SecurityContext> {
        private final String clientId; private final Clock clock; private final Duration skew;
        ClaimsVerifier(String clientId) { this(clientId, Clock.systemUTC(), Duration.ofSeconds(60)); }
        ClaimsVerifier(String clientId, Clock clock, Duration skew) { this.clientId = clientId; this.clock=clock; this.skew=skew; }
        @Override public void verify(JWTClaimsSet claims, SecurityContext context) throws BadJWTException {
            Date exp = claims.getExpirationTime(); Date iat = claims.getIssueTime(); Instant now = clock.instant();
            if (!GOOGLE_ISSUER.equals(claims.getIssuer())) throw new BadJWTException("GOOGLE_ISSUER_INVALID");
            if (exp == null || !exp.toInstant().isAfter(now)) throw new BadJWTException("GOOGLE_TOKEN_EXPIRED");
            if (iat == null || iat.toInstant().isAfter(now.plus(skew))) throw new BadJWTException("GOOGLE_IAT_INVALID");
            if (claims.getAudience() == null || !claims.getAudience().contains(clientId)) throw new BadJWTException("GOOGLE_AUDIENCE_INVALID");
        }
    }
}
