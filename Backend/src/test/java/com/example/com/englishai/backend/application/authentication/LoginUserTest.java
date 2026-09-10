package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.authentication.exception.InvalidCredentialsException;
import com.example.com.englishai.backend.application.authentication.exception.EmailVerificationRequiredException;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class LoginUserTest {

    private static final Instant NOW = Instant.parse("2026-01-01T12:00:00Z");
    private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final AuthenticationTokenGenerator accessTokenGenerator = mock(AuthenticationTokenGenerator.class);
    private final RefreshTokenGenerator refreshTokenGenerator = mock(RefreshTokenGenerator.class);
    private final RefreshTokenHasher refreshTokenHasher = mock(RefreshTokenHasher.class);
    private final RefreshTokenFamilyRepository refreshTokenFamilyRepository = mock(RefreshTokenFamilyRepository.class);
    private final RefreshTokenRepository refreshTokenRepository = mock(RefreshTokenRepository.class);
    private final RefreshTokenTransaction refreshTokenTransaction = mock(RefreshTokenTransaction.class);
    private final LoginUser loginUser = new LoginUser(
            userRepository, passwordEncoder, accessTokenGenerator, refreshTokenGenerator,
            refreshTokenHasher, refreshTokenFamilyRepository, refreshTokenTransaction, Duration.ofDays(30), CLOCK
    );

    @BeforeEach
    void executeTransactionCallbackImmediately() {
        when(refreshTokenTransaction.execute(any())).thenAnswer(invocation -> {
            Function<RefreshTokenRepository, String> operation = invocation.getArgument(0);
            return operation.apply(refreshTokenRepository);
        });
    }

    @Test
    void shouldGenerateAndPersistInitialRefreshToken() {
        User user = createUser();
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("correct-password", user.getPasswordHash())).thenReturn(true);
        when(accessTokenGenerator.generate(user.getId())).thenReturn("test-access-token");
        when(refreshTokenGenerator.generate()).thenReturn("test-refresh-token");
        when(refreshTokenHasher.hash("test-refresh-token")).thenReturn("refresh-hash");

        LoginResult result = loginUser.execute(user.getEmail(), "correct-password");

        assertThat(result.user()).isSameAs(user);
        assertThat(result.accessToken()).isEqualTo("test-access-token");
        assertThat(result.refreshToken()).isEqualTo("test-refresh-token");
        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository).save(captor.capture());
        RefreshToken persisted = captor.getValue();
        assertThat(persisted.getUserId()).isEqualTo(user.getId());
        assertThat(persisted.getFamilyId()).isNotNull();
        assertThat(persisted.getTokenHash()).isEqualTo("refresh-hash");
        assertThat(persisted.getTokenHash()).isNotEqualTo("test-refresh-token");
        assertThat(persisted.getCreatedAt()).isEqualTo(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        assertThat(persisted.getExpiresAt()).isEqualTo(OffsetDateTime.ofInstant(NOW.plus(Duration.ofDays(30)), ZoneOffset.UTC));
        assertThat(persisted.getRevokedAt()).isNull();
        assertThat(persisted.getReplacedById()).isNull();
        ArgumentCaptor<RefreshTokenFamily> familyCaptor = ArgumentCaptor.forClass(RefreshTokenFamily.class);
        verify(refreshTokenFamilyRepository).save(familyCaptor.capture());
        RefreshTokenFamily family = familyCaptor.getValue();
        assertThat(family.getId()).isEqualTo(persisted.getFamilyId());
        assertThat(family.getUserId()).isEqualTo(user.getId());
        assertThat(family.getCreatedAt()).isEqualTo(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        assertThat(family.getExpiresAt()).isEqualTo(OffsetDateTime.ofInstant(NOW.plus(Duration.ofDays(30)), ZoneOffset.UTC));
        assertThat(family.getRevokedAt()).isNull();
        verify(refreshTokenTransaction).execute(any());
        verify(passwordEncoder, never()).matchesDummy(anyString());
    }

    @Test
    void shouldCreateIndependentFamilyForEachLogin() {
        User user = createUser();
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(anyString(), eq(user.getPasswordHash()))).thenReturn(true);
        when(accessTokenGenerator.generate(user.getId())).thenReturn("access");
        when(refreshTokenGenerator.generate()).thenReturn("first", "second");
        when(refreshTokenHasher.hash(anyString())).thenReturn("hash-1", "hash-2");

        loginUser.execute(user.getEmail(), "password");
        loginUser.execute(user.getEmail(), "password");

        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository, times(2)).save(captor.capture());
        assertThat(captor.getAllValues().get(0).getFamilyId())
                .isNotEqualTo(captor.getAllValues().get(1).getFamilyId());
        ArgumentCaptor<RefreshTokenFamily> familyCaptor = ArgumentCaptor.forClass(RefreshTokenFamily.class);
        verify(refreshTokenFamilyRepository, times(2)).save(familyCaptor.capture());
        assertThat(familyCaptor.getAllValues().get(0).getId())
                .isNotEqualTo(familyCaptor.getAllValues().get(1).getId());
    }

    @Test
    void shouldCapInitialTokenAtFamilyAbsoluteExpiration() {
        User user = createUser();
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(anyString(), eq(user.getPasswordHash()))).thenReturn(true);
        when(accessTokenGenerator.generate(user.getId())).thenReturn("access");
        when(refreshTokenGenerator.generate()).thenReturn("raw");
        when(refreshTokenHasher.hash("raw")).thenReturn("hash");

        LoginUser capped = new LoginUser(userRepository, passwordEncoder, accessTokenGenerator,
                refreshTokenGenerator, refreshTokenHasher, refreshTokenFamilyRepository,
                refreshTokenTransaction, Duration.ofDays(40), Duration.ofDays(30), CLOCK);
        capped.execute(user.getEmail(), "password");

        ArgumentCaptor<RefreshTokenFamily> familyCaptor = ArgumentCaptor.forClass(RefreshTokenFamily.class);
        verify(refreshTokenFamilyRepository).save(familyCaptor.capture());
        ArgumentCaptor<RefreshToken> tokenCaptor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository).save(tokenCaptor.capture());
        assertThat(tokenCaptor.getValue().getExpiresAt()).isEqualTo(familyCaptor.getValue().getExpiresAt());
    }

    @Test
    void shouldNotIssueRefreshTokenForUnknownEmail() {
        when(userRepository.findByEmail("unknown@test.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> loginUser.execute("unknown@test.com", "some-password"))
                .isInstanceOf(InvalidCredentialsException.class);
        verify(passwordEncoder).matchesDummy("some-password");
        verifyNoInteractions(accessTokenGenerator, refreshTokenGenerator,
                refreshTokenHasher, refreshTokenTransaction, refreshTokenRepository, refreshTokenFamilyRepository);
    }

    @Test
    void shouldNotIssueRefreshTokenForIncorrectPassword() {
        User user = createUser();
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrong-password", user.getPasswordHash())).thenReturn(false);

        assertThatThrownBy(() -> loginUser.execute(user.getEmail(), "wrong-password"))
                .isInstanceOf(InvalidCredentialsException.class);
        verify(passwordEncoder, never()).matchesDummy(anyString());
        verifyNoInteractions(accessTokenGenerator, refreshTokenGenerator, refreshTokenHasher,
                refreshTokenTransaction, refreshTokenRepository, refreshTokenFamilyRepository);
    }

    @Test
    void shouldNotCreateTokenWhenFamilyPersistenceFails() {
        User user = createUser();
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password", user.getPasswordHash())).thenReturn(true);
        when(accessTokenGenerator.generate(user.getId())).thenReturn("access");
        when(refreshTokenGenerator.generate()).thenReturn("raw-refresh");
        when(refreshTokenHasher.hash("raw-refresh")).thenReturn("refresh-hash");
        when(refreshTokenFamilyRepository.save(any())).thenThrow(new IllegalStateException("family failure"));

        assertThatThrownBy(() -> loginUser.execute(user.getEmail(), "password"))
                .isInstanceOf(IllegalStateException.class);

        verify(refreshTokenFamilyRepository).save(any(RefreshTokenFamily.class));
        verifyNoInteractions(refreshTokenRepository);
    }

    @Test
    void shouldRejectCorrectPasswordWhenEmailIsNotVerifiedWithoutIssuingAnything() {
        User user = new User(UUID.randomUUID(), "unverified@test.com", "unverified", "stored-password-hash",
                OffsetDateTime.now(), OffsetDateTime.now(), false);
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password", user.getPasswordHash())).thenReturn(true);

        assertThatThrownBy(() -> loginUser.execute(user.getEmail(), "password"))
                .isExactlyInstanceOf(EmailVerificationRequiredException.class);
        verify(passwordEncoder).matches("password", user.getPasswordHash());
        verifyNoInteractions(accessTokenGenerator, refreshTokenGenerator, refreshTokenHasher,
                refreshTokenTransaction, refreshTokenRepository, refreshTokenFamilyRepository);
    }

    @Test
    void shouldKeepInvalidCredentialsForWrongPasswordOnUnverifiedAccount() {
        User user = new User(UUID.randomUUID(), "unverified@test.com", "unverified", "stored-password-hash",
                OffsetDateTime.now(), OffsetDateTime.now(), false);
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrong", user.getPasswordHash())).thenReturn(false);

        assertThatThrownBy(() -> loginUser.execute(user.getEmail(), "wrong"))
                .isExactlyInstanceOf(InvalidCredentialsException.class);
        verifyNoInteractions(accessTokenGenerator, refreshTokenGenerator, refreshTokenHasher,
                refreshTokenTransaction, refreshTokenRepository, refreshTokenFamilyRepository);
    }

    @Test
    void shouldPropagateTokenPersistenceFailureAfterCreatingFamily() {
        User user = createUser();
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password", user.getPasswordHash())).thenReturn(true);
        when(accessTokenGenerator.generate(user.getId())).thenReturn("access");
        when(refreshTokenGenerator.generate()).thenReturn("raw-refresh");
        when(refreshTokenHasher.hash("raw-refresh")).thenReturn("refresh-hash");
        when(refreshTokenRepository.save(any())).thenThrow(new IllegalStateException("token failure"));

        assertThatThrownBy(() -> loginUser.execute(user.getEmail(), "password"))
                .isInstanceOf(IllegalStateException.class);

        verify(refreshTokenFamilyRepository).save(any(RefreshTokenFamily.class));
        verify(refreshTokenRepository).save(any(RefreshToken.class));
    }

    private User createUser() {
        OffsetDateTime now = OffsetDateTime.now();
        return new User(UUID.randomUUID(), "user@test.com", "test-user", "stored-password-hash", now, now);
    }
}
