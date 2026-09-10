package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.ports.*;
import com.example.com.englishai.backend.domain.authentication.EmailVerificationCode;
import com.example.com.englishai.backend.domain.user.User;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Service
public class ResendEmailVerificationCode {
    private final UserRepository users;
    private final EmailVerificationCodeRepository codes;
    private final EmailVerificationCodeGenerator generator;
    private final EmailVerificationCodeHasher hasher;
    private final EmailSender sender;
    private final Duration expiration;
    private final int maxAttempts;
    private final Clock clock;

    public ResendEmailVerificationCode(UserRepository users, EmailVerificationCodeRepository codes,
                                        EmailVerificationCodeGenerator generator, EmailVerificationCodeHasher hasher,
                                        EmailSender sender,
                                        @Qualifier("emailVerificationCodeExpiration") Duration expiration,
                                        @Qualifier("emailVerificationMaxAttempts") Integer maxAttempts, @Qualifier("refreshTokenClock") Clock clock) {
        this.users = users; this.codes = codes; this.generator = generator; this.hasher = hasher;
        this.sender = sender; this.expiration = expiration; this.maxAttempts = maxAttempts; this.clock = clock;
    }

    @Transactional
    public void execute(String email) {
        User user = users.findByEmailForUpdate(email.trim()).orElse(null);
        if (user == null || user.isEmailVerified()) return;
        OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        for (EmailVerificationCode previous : codes.findByUserIdForUpdate(user.getId())) {
            if (previous.getUsedAt() == null && previous.getInvalidatedAt() == null) codes.save(previous.invalidate(now));
        }
        String raw = generator.generate();
        codes.save(new EmailVerificationCode(UUID.randomUUID(), user.getId(), hasher.hash(raw), now,
                now.plus(expiration), null, null, 0, maxAttempts));
        sender.sendEmailVerificationCode(user.getEmail(), raw);
    }
}


