package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.authentication.exception.InvalidPasswordResetCodeException;
import com.example.com.englishai.backend.application.ports.*;
import com.example.com.englishai.backend.domain.authentication.PasswordResetCode;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;
import com.example.com.englishai.backend.domain.user.User;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ResetPasswordTest {
    private final UserRepository users = mock(UserRepository.class);
    private final PasswordResetCodeRepository codes = mock(PasswordResetCodeRepository.class);
    private final PasswordResetCodeHasher hasher = mock(PasswordResetCodeHasher.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final RefreshTokenFamilyRepository families = mock(RefreshTokenFamilyRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-01-01T12:00:00Z"), ZoneOffset.UTC);
    private final ResetPassword reset = new ResetPassword(users, codes, hasher, passwords, families, clock);

    @Test
    void validCodeChangesPasswordConsumesCodeAndRevokesSessions() {
        UUID userId = UUID.randomUUID();
        User user = new User(userId, "user@example.com", "user", "old-hash", at("11:00"), at("11:00"), true);
        PasswordResetCode code = new PasswordResetCode(UUID.randomUUID(), userId, "expected", at("11:50"), at("13:00"), null, null, 0, 5);
        when(users.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(user));
        when(codes.findByUserIdForUpdate(userId)).thenReturn(List.of(code));
        when(hasher.hash("482731")).thenReturn("expected");
        when(passwords.encode("NewPass123")).thenReturn("new-hash");

        reset.execute("user@example.com", "482731", "NewPass123");

        verify(passwords).encode("NewPass123");
        verify(users).save(argThat(u -> u.getPasswordHash().equals("new-hash")));
        verify(codes).save(argThat(c -> c.getUsedAt().equals(at("12:00"))));
        verify(families).revokeAllByUserId(userId, at("12:00"), RefreshTokenFamilyRevocationReason.PASSWORD_RESET);
    }

    @Test
    void wrongCodeIncrementsAttemptsWithoutChangingPassword() {
        UUID userId = UUID.randomUUID();
        User user = new User(userId, "user@example.com", "user", "old-hash", at("11:00"), at("11:00"), true);
        PasswordResetCode code = new PasswordResetCode(UUID.randomUUID(), userId, "expected", at("11:50"), at("13:00"), null, null, 0, 5);
        when(users.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(user));
        when(codes.findByUserIdForUpdate(userId)).thenReturn(List.of(code));
        when(hasher.hash("111111")).thenReturn("other");
        assertThatThrownBy(() -> reset.execute("user@example.com", "111111", "NewPass123"))
                .isExactlyInstanceOf(InvalidPasswordResetCodeException.class);
        verify(codes).save(argThat(c -> c.getAttempts() == 1));
        verifyNoInteractions(passwords, families);
    }

    @Test
    void unknownUserDoesNotHashOrChangeAnything() {
        when(users.findByEmailForUpdate("missing@example.com")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> reset.execute("missing@example.com", "000042", "NewPass123"))
                .isExactlyInstanceOf(InvalidPasswordResetCodeException.class);
        verifyNoInteractions(codes, hasher, passwords, families);
    }

    @Test
    void expiredCodeIsRejectedWithoutChangingPassword() {
        UUID userId = UUID.randomUUID();
        User user = new User(userId, "user@example.com", "user", "old-hash", at("11:00"), at("11:00"), true);
        PasswordResetCode code = new PasswordResetCode(UUID.randomUUID(), userId, "expected", at("10:00"), at("12:00"), null, null, 0, 5);
        when(users.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(user));
        when(codes.findByUserIdForUpdate(userId)).thenReturn(List.of(code));
        assertThatThrownBy(() -> reset.execute("user@example.com", "482731", "NewPass123"))
                .isExactlyInstanceOf(InvalidPasswordResetCodeException.class);
        verifyNoInteractions(hasher, passwords, families);
    }

    private static OffsetDateTime at(String time) { return OffsetDateTime.parse("2026-01-01T" + time + ":00Z"); }
}
