package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.ports.EmailSender;
import com.example.com.englishai.backend.application.ports.PasswordResetCodeGenerator;
import com.example.com.englishai.backend.application.ports.PasswordResetCodeHasher;
import com.example.com.englishai.backend.application.ports.PasswordResetCodeRepository;
import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.application.user.exception.AmbiguousEmailAddressException;
import com.example.com.englishai.backend.application.authentication.exception.EmailDeliveryException;
import com.example.com.englishai.backend.domain.authentication.PasswordResetCode;
import com.example.com.englishai.backend.domain.user.EmailAddress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Service
public class RequestPasswordReset {
    private static final Logger LOG = LoggerFactory.getLogger(RequestPasswordReset.class);
    private final UserRepository users;
    private final PasswordResetCodeRepository codes;
    private final PasswordResetCodeGenerator generator;
    private final PasswordResetCodeHasher hasher;
    private final EmailSender sender;
    private final Duration expiration;
    private final int max;
    private final Clock clock;
    private final TransactionTemplate transactions;

    @Autowired
    public RequestPasswordReset(UserRepository users, PasswordResetCodeRepository codes,
                                PasswordResetCodeGenerator generator, PasswordResetCodeHasher hasher,
                                EmailSender sender, @Qualifier("passwordResetCodeExpiration") Duration expiration,
                                @Qualifier("passwordResetMaxAttempts") Integer max,
                                @Qualifier("refreshTokenClock") Clock clock,
                                PlatformTransactionManager transactionManager) {
        this.users = users;
        this.codes = codes;
        this.generator = generator;
        this.hasher = hasher;
        this.sender = sender;
        this.expiration = expiration;
        this.max = max;
        this.clock = clock;
        this.transactions = new TransactionTemplate(transactionManager);
        this.transactions.setPropagationBehavior(Propagation.REQUIRES_NEW.value());
    }

    /** Compatibility constructor for focused tests without a Spring transaction manager. */
    public RequestPasswordReset(UserRepository users, PasswordResetCodeRepository codes,
                                PasswordResetCodeGenerator generator, PasswordResetCodeHasher hasher,
                                EmailSender sender, Duration expiration, Integer max, Clock clock) {
        this.users = users;
        this.codes = codes;
        this.generator = generator;
        this.hasher = hasher;
        this.sender = sender;
        this.expiration = expiration;
        this.max = max;
        this.clock = clock;
        this.transactions = null;
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void execute(String email) {
        PendingEmail pending = transactions == null
                ? persist(email)
                : transactions.execute(status -> persist(email));
        if (pending == null) return;
        try {
            sender.sendPasswordResetCode(pending.email(), pending.code());
        } catch (EmailDeliveryException exception) {
            // A delivery failure must not reveal whether the account exists.
            LOG.warn("Password reset email delivery failed after commit");
        }
    }

    private PendingEmail persist(String email) {
        var user = findUserForPasswordReset(email);
        if (user == null) return null;

        var now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        for (var old : codes.findByUserIdForUpdate(user.getId())) {
            if (old.getUsedAt() == null && old.getInvalidatedAt() == null) codes.save(old.invalidate(now));
        }
        var raw = generator.generate();
        codes.save(new PasswordResetCode(UUID.randomUUID(), user.getId(), hasher.hash(raw), now,
                now.plus(expiration), null, null, 0, max));
        return new PendingEmail(user.getEmail(), raw);
    }

    private com.example.com.englishai.backend.domain.user.User findUserForPasswordReset(String email) {
        try {
            var user = users.findByEmailForUpdate(EmailAddress.normalize(email)).orElse(null);
            return user == null || user.getPasswordHash() == null ? null : user;
        } catch (AmbiguousEmailAddressException exception) {
            return null;
        }
    }

    private record PendingEmail(String email, String code) {}
}

