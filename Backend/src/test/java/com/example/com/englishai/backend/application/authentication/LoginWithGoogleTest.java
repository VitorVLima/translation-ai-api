package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.ports.*;
import com.example.com.englishai.backend.domain.authentication.*;
import com.example.com.englishai.backend.domain.user.User;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class LoginWithGoogleTest {
    private final ExternalIdentityProvider provider = mock(ExternalIdentityProvider.class);
    private final GoogleLoginNonce nonce = mock(GoogleLoginNonce.class);
    private final ExternalIdentityRepository identities = mock(ExternalIdentityRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final AuthenticationTokenGenerator access = mock(AuthenticationTokenGenerator.class);
    private final RefreshTokenGenerator refresh = mock(RefreshTokenGenerator.class);
    private final RefreshTokenHasher hasher = mock(RefreshTokenHasher.class);
    private final RefreshTokenFamilyRepository families = mock(RefreshTokenFamilyRepository.class);
    private final RefreshTokenTransaction transaction = mock(RefreshTokenTransaction.class);
    private final LoginWithGoogle login = new LoginWithGoogle(provider, identities, nonce, users, access, refresh, hasher,
            families, transaction, Duration.ofDays(7), Duration.ofDays(30), Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC));

    @Test
    void createsVerifiedGoogleUserWithoutPasswordAndSession() {
        when(nonce.consume("nonce")).thenReturn(true);
        when(provider.validate("credential", "nonce")).thenReturn(new ExternalIdentityProvider.ValidatedExternalIdentity(
                ExternalAuthProvider.GOOGLE, "sub-1", "new@example.com", true, "New User"));
        when(users.findByEmail("new@example.com")).thenReturn(Optional.empty());
        when(users.existsByUsername(any())).thenReturn(false);
        User saved = new User(UUID.randomUUID(), "new@example.com", "new_user_abc123", null,
                OffsetDateTime.parse("2026-01-01T00:00:00Z"), OffsetDateTime.parse("2026-01-01T00:00:00Z"), true);
        when(users.save(any())).thenReturn(saved);
        when(access.generate(saved.getId())).thenReturn("access");
        when(refresh.generate()).thenReturn("refresh"); when(hasher.hash("refresh")).thenReturn("hash");
        when(transaction.execute(any())).thenAnswer(inv -> ((Function<RefreshTokenRepository, String>) inv.getArgument(0))
                .apply(mock(RefreshTokenRepository.class)));

        LoginResult result = login.execute("credential", "nonce");

        assertThat(result.user().getPasswordHash()).isNull();
        assertThat(result.user().isEmailVerified()).isTrue();
        verify(identities).save(any(ExternalIdentity.class));
        verify(families).save(any(RefreshTokenFamily.class));
    }

    @Test
    void existingIdentityUsesExistingUser() {
        UUID userId = UUID.randomUUID();
        User user = new User(userId, "old@example.com", "user", null, OffsetDateTime.now(), OffsetDateTime.now(), true);
        when(nonce.consume("nonce")).thenReturn(true);
        when(provider.validate("credential", "nonce")).thenReturn(new ExternalIdentityProvider.ValidatedExternalIdentity(
                ExternalAuthProvider.GOOGLE, "sub-1", "changed@example.com", true, "User"));
        when(identities.findByProviderAndSubject(ExternalAuthProvider.GOOGLE, "sub-1"))
                .thenReturn(Optional.of(new ExternalIdentity(UUID.randomUUID(), userId, ExternalAuthProvider.GOOGLE, "sub-1", OffsetDateTime.now())));
        when(users.findById(userId)).thenReturn(Optional.of(user));
        when(access.generate(userId)).thenReturn("access");
        when(transaction.execute(any())).thenAnswer(inv -> "refresh");

        login.execute("credential", "nonce");

        verify(users, never()).save(any());
        verify(identities, never()).save(any());
        verify(access).generate(userId);
    }

    @Test
    void validatesGoogleCredentialBeforeConsumingNonce() {
        when(nonce.consume("nonce")).thenReturn(false);
        when(provider.validate("credential", "nonce")).thenThrow(new com.example.com.englishai.backend.application.authentication.exception.InvalidExternalIdentityException());

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> login.execute("credential", "nonce"))
                .isInstanceOf(com.example.com.englishai.backend.application.authentication.exception.InvalidExternalIdentityException.class);

        verify(nonce, never()).consume("nonce");
    }
}
