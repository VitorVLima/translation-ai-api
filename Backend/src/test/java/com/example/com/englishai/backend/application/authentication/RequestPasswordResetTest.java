package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.ports.EmailSender;
import com.example.com.englishai.backend.application.ports.PasswordResetCodeGenerator;
import com.example.com.englishai.backend.application.ports.PasswordResetCodeHasher;
import com.example.com.englishai.backend.application.ports.PasswordResetCodeRepository;
import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.domain.authentication.PasswordResetCode;
import com.example.com.englishai.backend.application.user.exception.AmbiguousEmailAddressException;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;

class RequestPasswordResetTest {
    private final UserRepository users = mock(UserRepository.class);
    private final PasswordResetCodeRepository codes = mock(PasswordResetCodeRepository.class);
    private final PasswordResetCodeGenerator generator = mock(PasswordResetCodeGenerator.class);
    private final PasswordResetCodeHasher hasher = mock(PasswordResetCodeHasher.class);
    private final EmailSender sender = mock(EmailSender.class);
    private final RequestPasswordReset request = new RequestPasswordReset(users, codes, generator, hasher, sender,
            Duration.ofMinutes(10), 5, Clock.fixed(Instant.parse("2026-01-01T12:00:00Z"), ZoneOffset.UTC));

    @Test
    void findsAnAccountForPasswordResetWithCaseInsensitiveEmailInput() {
        User user = new User(UUID.randomUUID(), "user@example.com", "user", "hash",
                OffsetDateTime.now(), OffsetDateTime.now(), true);
        when(users.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(user));
        when(codes.findByUserIdForUpdate(user.getId())).thenReturn(List.of());
        when(generator.generate()).thenReturn("123456");
        when(hasher.hash("123456")).thenReturn("hashed-code");

        request.execute("USER@EXAMPLE.COM");

        verify(users).findByEmailForUpdate("user@example.com");
        verify(codes).save(any());
        verify(sender).sendPasswordResetCode("user@example.com", "123456");
    }

    @Test
    void unverifiedLocalAccountCanRequestResetWithoutBeingVerified() {
        User user = new User(UUID.randomUUID(), "user@example.com", "user", "hash",
                at("12:00"), at("12:00"), false);
        when(users.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(user));
        when(codes.findByUserIdForUpdate(user.getId())).thenReturn(List.of());
        when(generator.generate()).thenReturn("123456");
        when(hasher.hash("123456")).thenReturn("hashed-code");

        request.execute("USER@EXAMPLE.COM");

        verify(codes).save(any());
        verify(sender).sendPasswordResetCode("user@example.com", "123456");
        verify(users, never()).save(any());
        org.assertj.core.api.Assertions.assertThat(user.isEmailVerified()).isFalse();
    }

    @Test
    void googleOnlyAccountDoesNotReceiveALocalPasswordResetCode() {
        User user = new User(UUID.randomUUID(), "google@example.com", "google", null,
                at("12:00"), at("12:00"), true);
        when(users.findByEmailForUpdate("google@example.com")).thenReturn(Optional.of(user));

        request.execute("google@example.com");

        verifyNoInteractions(codes, generator, hasher, sender);
        verify(users, never()).save(any());
    }

    @Test
    void ambiguousLegacyEmailDoesNotReceiveResetCode() {
        when(users.findByEmailForUpdate("user@example.com")).thenThrow(new AmbiguousEmailAddressException());

        request.execute("USER@EXAMPLE.COM");

        verifyNoInteractions(codes, generator, hasher, sender);
        verify(users, never()).save(any());
    }

    @Test
    void recentPersistedRequestSuppressesAnotherCodeAndEmail() {
        User user = new User(UUID.randomUUID(), "user@example.com", "user", "hash",
                at("11:00"), at("11:00"), true);
        when(users.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(user));
        when(codes.findByUserIdForUpdate(user.getId())).thenReturn(List.of(new PasswordResetCode(
                UUID.randomUUID(), user.getId(), "hash", OffsetDateTime.parse("2026-01-01T11:59:30Z"), at("12:09"),
                null, null, 0, 5)));

        request.execute("user@example.com");

        verifyNoInteractions(generator, hasher, sender);
        verify(codes, never()).save(any());
    }

    @Test
    void requestAfterCooldownReplacesCodeAndSendsOnce() {
        User user = new User(UUID.randomUUID(), "user@example.com", "user", "hash",
                at("11:00"), at("11:00"), true);
        when(users.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(user));
        when(codes.findByUserIdForUpdate(user.getId())).thenReturn(List.of(new PasswordResetCode(
                UUID.randomUUID(), user.getId(), "old-hash", at("11:58"), at("12:08"),
                null, null, 0, 5)));
        when(generator.generate()).thenReturn("123456");
        when(hasher.hash("123456")).thenReturn("new-hash");

        request.execute("user@example.com");

        verify(codes, org.mockito.Mockito.times(2)).save(any());
        verify(sender).sendPasswordResetCode("user@example.com", "123456");
    }

    private static OffsetDateTime at(String time) {
        return OffsetDateTime.parse("2026-01-01T" + time + ":00Z");
    }
}
