package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.ports.EmailSender;
import com.example.com.englishai.backend.application.ports.EmailVerificationCodeGenerator;
import com.example.com.englishai.backend.application.ports.EmailVerificationCodeHasher;
import com.example.com.englishai.backend.application.ports.EmailVerificationCodeRepository;
import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.domain.user.User;
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

class ResendEmailVerificationCodeTest {
    private final UserRepository users = mock(UserRepository.class);
    private final EmailVerificationCodeRepository codes = mock(EmailVerificationCodeRepository.class);
    private final EmailVerificationCodeGenerator generator = mock(EmailVerificationCodeGenerator.class);
    private final EmailVerificationCodeHasher hasher = mock(EmailVerificationCodeHasher.class);
    private final EmailSender sender = mock(EmailSender.class);
    private final ResendEmailVerificationCode resend = new ResendEmailVerificationCode(users, codes, generator, hasher,
            sender, Duration.ofMinutes(10), 5, Clock.fixed(Instant.parse("2026-01-01T12:00:00Z"), ZoneOffset.UTC));

    @Test
    void findsAnUnverifiedAccountWithCaseInsensitiveEmailInput() {
        User user = new User(UUID.randomUUID(), "user@example.com", "user", "hash",
                OffsetDateTime.now(), OffsetDateTime.now(), false);
        when(users.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(user));
        when(codes.findByUserIdForUpdate(user.getId())).thenReturn(List.of());
        when(generator.generate()).thenReturn("123456");
        when(hasher.hash("123456")).thenReturn("hashed-code");

        resend.execute("USER@EXAMPLE.COM");

        verify(users).findByEmailForUpdate("user@example.com");
        verify(codes).save(any());
        verify(sender).sendEmailVerificationCode("user@example.com", "123456");
    }
}
