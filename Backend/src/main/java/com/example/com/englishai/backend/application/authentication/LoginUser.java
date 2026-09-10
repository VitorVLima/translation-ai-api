package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.authentication.exception.InvalidCredentialsException;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenGenerator;
import com.example.com.englishai.backend.application.ports.PasswordEncoder;
import com.example.com.englishai.backend.application.ports.RefreshTokenGenerator;
import com.example.com.englishai.backend.application.ports.RefreshTokenHasher;
import com.example.com.englishai.backend.application.ports.RefreshTokenFamilyRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenTransaction;
import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.domain.authentication.RefreshToken;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamily;
import com.example.com.englishai.backend.domain.user.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.UUID;

@Service
public class LoginUser {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationTokenGenerator accessTokenGenerator;
    private final RefreshTokenGenerator refreshTokenGenerator;
    private final RefreshTokenHasher refreshTokenHasher;
    private final RefreshTokenFamilyRepository refreshTokenFamilyRepository;
    private final RefreshTokenTransaction refreshTokenTransaction;
    private final Duration refreshTokenExpiration;
    private final Clock clock;

    @Autowired
    public LoginUser(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuthenticationTokenGenerator accessTokenGenerator,
            RefreshTokenGenerator refreshTokenGenerator,
            RefreshTokenHasher refreshTokenHasher,
            RefreshTokenFamilyRepository refreshTokenFamilyRepository,
            RefreshTokenTransaction refreshTokenTransaction,
            Duration refreshTokenExpiration,
            Clock clock
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.accessTokenGenerator = accessTokenGenerator;
        this.refreshTokenGenerator = refreshTokenGenerator;
        this.refreshTokenHasher = refreshTokenHasher;
        this.refreshTokenFamilyRepository = Objects.requireNonNull(
                refreshTokenFamilyRepository, "Refresh token family repository is required"
        );
        this.refreshTokenTransaction = refreshTokenTransaction;
        if (refreshTokenExpiration == null || refreshTokenExpiration.isZero() || refreshTokenExpiration.isNegative()) {
            throw new IllegalArgumentException("Refresh token expiration must be positive");
        }
        this.refreshTokenExpiration = refreshTokenExpiration;
        this.clock = Objects.requireNonNull(clock, "Clock is required");
    }

    public LoginResult execute(String email, String rawPassword) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(InvalidCredentialsException::new);

        if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }

        String accessToken = accessTokenGenerator.generate(user.getId());
        String refreshToken = refreshTokenTransaction.execute(repository -> issueRefreshToken(user, repository));
        return new LoginResult(user, accessToken, refreshToken);
    }

    private String issueRefreshToken(User user, RefreshTokenRepository repository) {
        String rawRefreshToken = refreshTokenGenerator.generate();
        String tokenHash = refreshTokenHasher.hash(rawRefreshToken);
        OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        UUID familyId = UUID.randomUUID();
        refreshTokenFamilyRepository.save(new RefreshTokenFamily(
                familyId,
                user.getId(),
                now,
                now.plus(refreshTokenExpiration),
                null
        ));
        repository.save(new RefreshToken(
                UUID.randomUUID(),
                user.getId(),
                familyId,
                tokenHash,
                now.plus(refreshTokenExpiration),
                now,
                null,
                null
        ));
        return rawRefreshToken;
    }
}
