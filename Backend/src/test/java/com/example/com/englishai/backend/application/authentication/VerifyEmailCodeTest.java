package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.authentication.exception.InvalidEmailVerificationCodeException;
import com.example.com.englishai.backend.application.ports.*;
import com.example.com.englishai.backend.domain.authentication.EmailVerificationCode;
import com.example.com.englishai.backend.domain.user.User;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class VerifyEmailCodeTest {
    private final UserRepository users = mock(UserRepository.class);
    private final EmailVerificationCodeRepository codes = mock(EmailVerificationCodeRepository.class);
    private final EmailVerificationCodeHasher hasher = mock(EmailVerificationCodeHasher.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-01-01T12:00:00Z"), ZoneOffset.UTC);
    private final VerifyEmailCode useCase = new VerifyEmailCode(users, codes, hasher, clock);

    @Test
    void confirmsCodeAndUpdatesBothRecords() {
        UUID id = UUID.randomUUID();
        User user = new User(id, "user@example.com", "user", "hash", at("11:00"), at("11:00"), false);
        EmailVerificationCode code = new EmailVerificationCode(UUID.randomUUID(), id, "hash-code", at("11:50"), at("13:00"), null, 0, 5);
        when(users.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(user));
        when(codes.findLatestActiveByUserIdForUpdate(eq(id), any())).thenReturn(Optional.of(code));
        when(hasher.hash("000042")).thenReturn("hash-code");

        useCase.execute("user@example.com", "000042");

        verify(codes).save(argThat(c -> c.getUsedAt().equals(at("12:00"))));
        verify(users).save(argThat(User::isEmailVerified));
    }

    @Test
    void wrongCodeIncrementsAttemptsAndReturnsGenericError() {
        UUID id = UUID.randomUUID();
        User user = new User(id, "user@example.com", "user", "hash", at("11:00"), at("11:00"), false);
        EmailVerificationCode code = new EmailVerificationCode(UUID.randomUUID(), id, "expected", at("11:50"), at("13:00"), null, 1, 5);
        when(users.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(user));
        when(codes.findLatestActiveByUserIdForUpdate(eq(id), any())).thenReturn(Optional.of(code));
        when(hasher.hash("111111")).thenReturn("other");

        assertThatThrownBy(() -> useCase.execute("user@example.com", "111111"))
                .isExactlyInstanceOf(InvalidEmailVerificationCodeException.class)
                .hasMessage("Invalid or expired verification code");
        verify(codes).save(argThat(c -> c.getAttempts() == 2));
        verify(users, never()).save(any());
    }

    @Test
    void unknownUserDoesNotHashOrPersist() {
        when(users.findByEmailForUpdate("missing@example.com")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> useCase.execute("missing@example.com", "000042"))
                .isExactlyInstanceOf(InvalidEmailVerificationCodeException.class);
        verifyNoInteractions(hasher, codes);
    }

    @Test
    void alreadyVerifiedIsIdempotent() {
        User user = new User(UUID.randomUUID(), "user@example.com", "user", "hash", at("11:00"), at("11:00"), true);
        when(users.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(user));
        useCase.execute("user@example.com", "000042");
        verifyNoInteractions(hasher, codes);
    }

    @Test
    void expiredOrExhaustedCodeIsRejected() {
        UUID id = UUID.randomUUID();
        User user = new User(id, "user@example.com", "user", "hash", at("11:00"), at("11:00"), false);
        when(users.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(user));
        when(codes.findLatestActiveByUserIdForUpdate(eq(id), any())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> useCase.execute("user@example.com", "000042"))
                .isExactlyInstanceOf(InvalidEmailVerificationCodeException.class);
        verifyNoInteractions(hasher);
    }

    private static OffsetDateTime at(String time) { return OffsetDateTime.parse("2026-01-01T" + time + ":00Z"); }
}
