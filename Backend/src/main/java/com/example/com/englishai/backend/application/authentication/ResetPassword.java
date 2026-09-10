package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.authentication.exception.InvalidPasswordResetCodeException;
import com.example.com.englishai.backend.application.ports.PasswordEncoder;
import com.example.com.englishai.backend.application.ports.PasswordResetCodeHasher;
import com.example.com.englishai.backend.application.ports.PasswordResetCodeRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenFamilyRepository;
import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.domain.authentication.PasswordResetCode;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Service
public class ResetPassword {
    private final UserRepository users;
    private final PasswordResetCodeRepository codes;
    private final PasswordResetCodeHasher hasher;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenFamilyRepository families;
    private final Clock clock;

    public ResetPassword(UserRepository users, PasswordResetCodeRepository codes,
                         PasswordResetCodeHasher hasher, PasswordEncoder passwordEncoder,
                         RefreshTokenFamilyRepository families,
                         @Qualifier("refreshTokenClock") Clock clock) {
        this.users = users; this.codes = codes; this.hasher = hasher;
        this.passwordEncoder = passwordEncoder; this.families = families; this.clock = clock;
    }

    @Transactional
    public void execute(String email, String rawCode, String newPassword) {
        var user = users.findByEmailForUpdate(email.trim()).orElseThrow(InvalidPasswordResetCodeException::new);
        var now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        PasswordResetCode code = codes.findByUserIdForUpdate(user.getId()).stream()
                .filter(c -> c.getUsedAt() == null && c.getInvalidatedAt() == null
                        && now.isBefore(c.getExpiresAt()) && c.getAttempts() < c.getMaxAttempts())
                .findFirst().orElseThrow(InvalidPasswordResetCodeException::new);
        String candidate = hasher.hash(rawCode);
        if (!MessageDigest.isEqual(candidate.getBytes(StandardCharsets.UTF_8), code.getCodeHash().getBytes(StandardCharsets.UTF_8))) {
            codes.save(code.incrementAttempts());
            throw new InvalidPasswordResetCodeException();
        }
        users.save(user.changePassword(passwordEncoder.encode(newPassword), now));
        codes.save(code.markUsed(now));
        families.revokeAllByUserId(user.getId(), now, RefreshTokenFamilyRevocationReason.PASSWORD_RESET);
    }
}
