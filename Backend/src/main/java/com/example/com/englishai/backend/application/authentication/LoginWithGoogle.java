package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.authentication.exception.AuthenticationMethodConflictException;
import com.example.com.englishai.backend.application.authentication.exception.InvalidExternalIdentityException;
import com.example.com.englishai.backend.application.authentication.exception.ExternalIdentityConflictException;
import com.example.com.englishai.backend.application.user.exception.UserAlreadyExistsException;
import com.example.com.englishai.backend.application.ports.*;
import com.example.com.englishai.backend.domain.authentication.*;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.domain.user.EmailAddress;
import com.example.com.englishai.backend.application.user.exception.AmbiguousEmailAddressException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.time.*;
import java.util.UUID;

@Service
@ConditionalOnExpression("'${GOOGLE_CLIENT_ID:}'.trim().length() > 0")
public class LoginWithGoogle {
    private static final Logger log = LoggerFactory.getLogger(LoginWithGoogle.class);
    private final ExternalIdentityProvider provider; private final ExternalIdentityRepository identities;
    private final GoogleLoginNonce nonceStore;
    private final UserRepository users; private final AuthenticationTokenGenerator access;
    private final RefreshTokenGenerator refresh; private final RefreshTokenHasher hasher;
    private final RefreshTokenFamilyRepository families; private final RefreshTokenTransaction transaction;
    private final Duration refreshDuration, familyLifetime; private final Clock clock;

    public LoginWithGoogle(ExternalIdentityProvider provider, ExternalIdentityRepository identities, GoogleLoginNonce nonceStore, UserRepository users,
                           AuthenticationTokenGenerator access, RefreshTokenGenerator refresh, RefreshTokenHasher hasher,
                           RefreshTokenFamilyRepository families, RefreshTokenTransaction transaction,
                           @Qualifier("refreshTokenExpiration") Duration refreshDuration,
                           @Qualifier("refreshTokenFamilyMaxLifetime") Duration familyLifetime,
                           @Qualifier("refreshTokenClock") Clock clock) {
        this.provider=provider; this.identities=identities; this.nonceStore=nonceStore; this.users=users; this.access=access; this.refresh=refresh;
        this.hasher=hasher; this.families=families; this.transaction=transaction; this.refreshDuration=refreshDuration;
        this.familyLifetime=familyLifetime; this.clock=clock;
    }

    @Transactional
    public LoginResult execute(String credential, String nonce) {
        var external = provider.validate(credential, nonce);
        // Consume only after cryptographic validation. A malformed or transiently
        // unverifiable credential must not burn a valid challenge.
        if (!nonceStore.consume(nonce)) {
            log.debug("Google identity validation rejected: GOOGLE_NONCE_EXPIRED_OR_ALREADY_USED");
            throw new InvalidExternalIdentityException();
        }
        if (!external.emailVerified()) throw new InvalidExternalIdentityException();
        var identity = identities.findByProviderAndSubject(external.provider(), external.subject()).orElse(null);
        User user;
        if (identity != null) {
            user = users.findById(identity.userId()).orElseThrow(InvalidExternalIdentityException::new);
        } else {
            String normalizedEmail = EmailAddress.normalize(external.email());
            try {
                user = users.findByEmail(normalizedEmail).orElse(null);
            } catch (AmbiguousEmailAddressException exception) {
                throw new AuthenticationMethodConflictException();
            }
            if (user != null) throw new AuthenticationMethodConflictException();
            String username = external.displayName() == null ? null : external.displayName().trim();
            if (username != null && username.isBlank()) username = null;
            if (username != null && username.length() > 100) username = username.substring(0, 100).trim();
            try {
                user = users.save(new User(UUID.randomUUID(), normalizedEmail, username, null, now(), now(), true));
                identities.save(new ExternalIdentity(UUID.randomUUID(), user.getId(), external.provider(), external.subject(), now()));
            } catch (UserAlreadyExistsException | ExternalIdentityConflictException e) {
                throw new AuthenticationMethodConflictException();
            }
        }
        String accessToken = access.generate(user.getId());
        User authenticatedUser = user;
        String refreshToken = transaction.execute(repository -> issueRefreshToken(authenticatedUser, repository));
        return new LoginResult(authenticatedUser, accessToken, refreshToken);
    }

    private OffsetDateTime now() { return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC); }
    private String issueRefreshToken(User user, RefreshTokenRepository repository) {
        String raw = refresh.generate(); String tokenHash = hasher.hash(raw); OffsetDateTime created = now();
        UUID familyId = UUID.randomUUID(); OffsetDateTime familyExpires = created.plus(familyLifetime);
        families.save(new RefreshTokenFamily(familyId, user.getId(), created, familyExpires, null));
        repository.save(new RefreshToken(UUID.randomUUID(), user.getId(), familyId, tokenHash,
                min(created.plus(refreshDuration), familyExpires), created, null, null));
        return raw;
    }
    private static OffsetDateTime min(OffsetDateTime a, OffsetDateTime b) { return a.isBefore(b) ? a : b; }
}
