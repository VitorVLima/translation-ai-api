package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.ports.*;
import com.example.com.englishai.backend.application.user.usecase.CreateUser;
import com.example.com.englishai.backend.domain.authentication.EmailVerificationCode;
import com.example.com.englishai.backend.domain.user.User;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RegisterUserVerificationCodeTest {
    @Test
    void shouldPersistHashedCodeAndSendRawCodeAfterCreatingUser() {
        UserRepository users = mock(UserRepository.class);
        PasswordEncoder passwords = mock(PasswordEncoder.class);
        EmailVerificationCodeGenerator generator = mock(EmailVerificationCodeGenerator.class);
        EmailVerificationCodeHasher hasher = mock(EmailVerificationCodeHasher.class);
        EmailVerificationCodeRepository codes = mock(EmailVerificationCodeRepository.class);
        EmailSender sender = mock(EmailSender.class);
        User user = new User(UUID.randomUUID(), "new@example.com", "new-user", "hash",
                OffsetDateTime.now(), OffsetDateTime.now(), false);
        when(passwords.encode("password")).thenReturn("hash");
        when(users.save(any(User.class))).thenReturn(user);
        when(generator.generate()).thenReturn("000042");
        when(hasher.hash("000042")).thenReturn("code-hash");

        RegisterUser register = new RegisterUser(new CreateUser(users), passwords, generator, hasher, codes,
                sender, Duration.ofMinutes(10), 5, Clock.fixed(Instant.parse("2026-01-01T12:00:00Z"), ZoneOffset.UTC));
        register.execute("new@example.com", "new-user", "password");

        var captor = org.mockito.ArgumentCaptor.forClass(EmailVerificationCode.class);
        verify(codes).save(captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo(user.getId());
        assertThat(captor.getValue().getCodeHash()).isEqualTo("code-hash");
        assertThat(captor.getValue().getCreatedAt()).isEqualTo(OffsetDateTime.parse("2026-01-01T12:00Z"));
        assertThat(captor.getValue().getExpiresAt()).isEqualTo(OffsetDateTime.parse("2026-01-01T12:10Z"));
        assertThat(captor.getValue().getAttempts()).isZero();
        assertThat(captor.getValue().getMaxAttempts()).isEqualTo(5);
        assertThat(captor.getValue().getUsedAt()).isNull();
        assertThat(captor.getValue().toString()).doesNotContain("000042", "code-hash");
        verify(sender).sendEmailVerificationCode("new@example.com", "000042");
    }

    @Test
    void failedOrDuplicateRegistrationDoesNotGenerateOrSendCode() {
        UserRepository users = mock(UserRepository.class);
        PasswordEncoder passwords = mock(PasswordEncoder.class);
        EmailVerificationCodeGenerator generator = mock(EmailVerificationCodeGenerator.class);
        EmailVerificationCodeHasher hasher = mock(EmailVerificationCodeHasher.class);
        EmailVerificationCodeRepository codes = mock(EmailVerificationCodeRepository.class);
        EmailSender sender = mock(EmailSender.class);
        when(passwords.encode("password")).thenReturn("hash");
        when(users.existsByEmail("duplicate@example.com")).thenReturn(true);

        RegisterUser register = new RegisterUser(new CreateUser(users), passwords, generator, hasher, codes,
                sender, Duration.ofMinutes(10), 5, Clock.systemUTC());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> register.execute("duplicate@example.com", "user", "password"))
                .isInstanceOf(RuntimeException.class);
        verifyNoInteractions(generator, hasher, codes, sender);
    }
}
