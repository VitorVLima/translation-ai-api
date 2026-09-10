package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.ports.PasswordEncoder;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.domain.authentication.EmailVerificationCode;
import com.example.com.englishai.backend.application.user.usecase.CreateUser;
import com.example.com.englishai.backend.application.ports.EmailSender;
import com.example.com.englishai.backend.application.ports.EmailVerificationCodeGenerator;
import com.example.com.englishai.backend.application.ports.EmailVerificationCodeHasher;
import com.example.com.englishai.backend.application.ports.EmailVerificationCodeRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.Duration;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class RegisterUser {

    private final CreateUser createUser;
    private final PasswordEncoder passwordEncoder;
    private final EmailVerificationCodeGenerator codeGenerator;
    private final EmailVerificationCodeHasher codeHasher;
    private final EmailVerificationCodeRepository codeRepository;
    private final EmailSender emailSender;
    private final Duration codeExpiration;
    private final int maxAttempts;
    private final Clock clock;

    @Autowired
    public RegisterUser(
            CreateUser createUser,
            PasswordEncoder passwordEncoder,
            EmailVerificationCodeGenerator codeGenerator,
            EmailVerificationCodeHasher codeHasher,
            EmailVerificationCodeRepository codeRepository,
            EmailSender emailSender,
            @Qualifier("emailVerificationCodeExpiration") Duration codeExpiration,
            @Qualifier("emailVerificationMaxAttempts") Integer maxAttempts,
            @Qualifier("refreshTokenClock") Clock clock
    ) {
        this.createUser = createUser;
        this.passwordEncoder = passwordEncoder;
        this.codeGenerator = codeGenerator;
        this.codeHasher = codeHasher;
        this.codeRepository = codeRepository;
        this.emailSender = emailSender;
        this.codeExpiration = codeExpiration;
        this.maxAttempts = maxAttempts;
        this.clock = clock;
    }

    /** Compatibility constructor for isolated password-hashing tests. */
    public RegisterUser(CreateUser createUser, PasswordEncoder passwordEncoder) {
        this(createUser, passwordEncoder, null, null, null, null, Duration.ZERO, 1, null);
    }

    @Transactional
    public User execute(
            String email,
            String username,
            String rawPassword
    ) {

        String passwordHash = passwordEncoder.encode(rawPassword);

        User user = createUser.execute(
                email,
                username,
                passwordHash
        );
        if (codeGenerator == null) return user;

        String code = codeGenerator.generate();
        OffsetDateTime createdAt = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        codeRepository.save(new EmailVerificationCode(
                UUID.randomUUID(), user.getId(), codeHasher.hash(code), createdAt,
                createdAt.plus(codeExpiration), null, 0, maxAttempts
        ));
        emailSender.sendEmailVerificationCode(user.getEmail(), code);
        return user;
    }
}
