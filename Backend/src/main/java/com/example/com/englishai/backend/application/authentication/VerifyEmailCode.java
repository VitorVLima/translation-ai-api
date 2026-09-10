package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.authentication.exception.InvalidEmailVerificationCodeException;
import com.example.com.englishai.backend.application.ports.EmailVerificationCodeHasher;
import com.example.com.englishai.backend.application.ports.EmailVerificationCodeRepository;
import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.domain.authentication.EmailVerificationCode;
import com.example.com.englishai.backend.domain.user.User;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Service
public class VerifyEmailCode {
    private final UserRepository users;
    private final EmailVerificationCodeRepository codes;
    private final EmailVerificationCodeHasher hasher;
    private final Clock clock;

    public VerifyEmailCode(UserRepository users, EmailVerificationCodeRepository codes,
                           EmailVerificationCodeHasher hasher,
                           @Qualifier("refreshTokenClock") Clock clock) {
        this.users = users;
        this.codes = codes;
        this.hasher = hasher;
        this.clock = clock;
    }

    @Transactional
    public void execute(String email, String rawCode) {
        String normalizedEmail = email.trim();
        User user = users.findByEmailForUpdate(normalizedEmail)
                .orElseThrow(InvalidEmailVerificationCodeException::new);
        if (user.isEmailVerified()) return;

        OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        EmailVerificationCode code = codes.findLatestActiveByUserIdForUpdate(user.getId(), now)
                .orElseThrow(InvalidEmailVerificationCodeException::new);
        if (code.getAttempts() >= code.getMaxAttempts()) {
            throw new InvalidEmailVerificationCodeException();
        }

        String candidateHash = hasher.hash(rawCode);
        if (!MessageDigest.isEqual(candidateHash.getBytes(StandardCharsets.UTF_8),
                code.getCodeHash().getBytes(StandardCharsets.UTF_8))) {
            codes.save(code.incrementAttempts());
            throw new InvalidEmailVerificationCodeException();
        }

        codes.save(code.markUsed(now));
        users.save(user.verifyEmail(now));
    }
}
