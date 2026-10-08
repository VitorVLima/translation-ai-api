package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.ports.*;
import com.example.com.englishai.backend.domain.authentication.EmailVerificationCode;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.domain.user.EmailAddress;
import com.example.com.englishai.backend.application.user.exception.AmbiguousEmailAddressException;
import com.example.com.englishai.backend.application.authentication.exception.EmailDeliveryException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Service
public class ResendEmailVerificationCode {
    private static final Logger LOG = LoggerFactory.getLogger(ResendEmailVerificationCode.class);
    private final UserRepository users;
    private final EmailVerificationCodeRepository codes;
    private final EmailVerificationCodeGenerator generator;
    private final EmailVerificationCodeHasher hasher;
    private final EmailSender sender;
    private final Duration expiration;
    private final int maxAttempts;
    private final Clock clock;
    private final TransactionTemplate transactions;

    @Autowired
    public ResendEmailVerificationCode(UserRepository users, EmailVerificationCodeRepository codes,
                                        EmailVerificationCodeGenerator generator, EmailVerificationCodeHasher hasher,
                                        EmailSender sender,
                                        @Qualifier("emailVerificationCodeExpiration") Duration expiration,
                                        @Qualifier("emailVerificationMaxAttempts") Integer maxAttempts,
                                        @Qualifier("refreshTokenClock") Clock clock,
                                        PlatformTransactionManager transactionManager) {
        this.users = users; this.codes = codes; this.generator = generator; this.hasher = hasher;
        this.sender = sender; this.expiration = expiration; this.maxAttempts = maxAttempts; this.clock = clock;
        this.transactions = new TransactionTemplate(transactionManager);
        this.transactions.setPropagationBehavior(Propagation.REQUIRES_NEW.value());
    }

    /** Compatibility constructor for focused tests without a Spring transaction manager. */
    public ResendEmailVerificationCode(UserRepository users, EmailVerificationCodeRepository codes,
                                       EmailVerificationCodeGenerator generator, EmailVerificationCodeHasher hasher,
                                       EmailSender sender, Duration expiration, Integer maxAttempts, Clock clock) {
        this.users = users; this.codes = codes; this.generator = generator; this.hasher = hasher;
        this.sender = sender; this.expiration = expiration; this.maxAttempts = maxAttempts; this.clock = clock;
        this.transactions = null;
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void execute(String email) {
        PendingEmail pending = transactions == null
                ? persist(email)
                : transactions.execute(status -> persist(email));
        if (pending == null) return;
        try {
            sender.sendEmailVerificationCode(pending.email(), pending.code());
        } catch (EmailDeliveryException exception) {
            // Keep the public response identical for missing and existing accounts.
            LOG.warn("Verification email delivery failed after commit");
        }
    }

    private PendingEmail persist(String email) {
        User user;
        try {
            user = users.findByEmailForUpdate(EmailAddress.normalize(email)).orElse(null);
        } catch (AmbiguousEmailAddressException exception) {
            return null;
        }
        if (user == null || user.isEmailVerified()) return null;
        OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        for (EmailVerificationCode previous : codes.findByUserIdForUpdate(user.getId())) {
            if (previous.getUsedAt() == null && previous.getInvalidatedAt() == null) codes.save(previous.invalidate(now));
        }
        String raw = generator.generate();
        codes.save(new EmailVerificationCode(UUID.randomUUID(), user.getId(), hasher.hash(raw), now,
                now.plus(expiration), null, null, 0, maxAttempts));
        return new PendingEmail(user.getEmail(), raw);
    }

    private record PendingEmail(String email, String code) {}
}


