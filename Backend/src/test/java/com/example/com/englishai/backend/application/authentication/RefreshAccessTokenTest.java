package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.authentication.exception.InvalidRefreshTokenException;
import com.example.com.englishai.backend.application.authentication.exception.RefreshTokenReuseException;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenGenerator;
import com.example.com.englishai.backend.application.ports.RefreshTokenGenerator;
import com.example.com.englishai.backend.application.ports.RefreshTokenHasher;
import com.example.com.englishai.backend.application.ports.RefreshTokenFamilyRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenTransaction;
import com.example.com.englishai.backend.domain.authentication.RefreshToken;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamily;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

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
import static org.mockito.Mockito.*;

class RefreshAccessTokenTest {

    private static final Instant NOW = Instant.parse("2026-01-01T12:00:00Z");
    private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

    private final RefreshTokenHasher hasher = mock(RefreshTokenHasher.class);
    private final RefreshTokenGenerator tokenGenerator = mock(RefreshTokenGenerator.class);
    private final AuthenticationTokenGenerator accessTokenGenerator = mock(AuthenticationTokenGenerator.class);
    private final RefreshTokenRepository repository = mock(RefreshTokenRepository.class);
    private final RefreshTokenFamilyRepository familyRepository = mock(RefreshTokenFamilyRepository.class);
    private final RefreshTokenTransaction transaction = mock(RefreshTokenTransaction.class);
    private final RefreshAccessToken useCase = new RefreshAccessToken(
            hasher, tokenGenerator, accessTokenGenerator, familyRepository, transaction, Duration.ofDays(30), CLOCK
    );

    @BeforeEach
    void executeTransactionCallbackImmediately() {
        when(transaction.execute(any())).thenAnswer(invocation -> {
            Function<RefreshTokenRepository, Object> operation = invocation.getArgument(0);
            return operation.apply(repository);
        });
    }

    @Test
    void shouldRotateValidTokenInsideTransaction() {
        UUID userId = UUID.randomUUID();
        UUID familyId = UUID.randomUUID();
        RefreshToken current = token(userId, familyId, NOW.plusSeconds(60), null, null, "old-hash");
        when(hasher.hash("old-raw")).thenReturn("old-hash");
        when(hasher.hash("new-raw")).thenReturn("new-hash");
        when(repository.findByTokenHashForUpdate("old-hash")).thenReturn(Optional.of(current));
        stubFamily(current);
        when(tokenGenerator.generate()).thenReturn("new-raw");
        when(accessTokenGenerator.generate(userId)).thenReturn("new-access");

        RefreshAccessTokenResult result = useCase.execute("old-raw");

        assertThat(result.accessToken()).isEqualTo("new-access");
        assertThat(result.refreshToken()).isEqualTo("new-raw");
        ArgumentCaptor<RefreshToken> previous = ArgumentCaptor.forClass(RefreshToken.class);
        ArgumentCaptor<RefreshToken> replacementCaptor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(repository).persistRotation(previous.capture(), replacementCaptor.capture());
        RefreshToken rotated = previous.getValue();
        RefreshToken replacement = replacementCaptor.getValue();
        assertThat(rotated.getRevokedAt()).isEqualTo(at(NOW));
        assertThat(rotated.getReplacedById()).isEqualTo(replacement.getId());
        assertThat(replacement.getFamilyId()).isEqualTo(familyId);
        assertThat(replacement.getUserId()).isEqualTo(userId);
        assertThat(replacement.getTokenHash()).isEqualTo("new-hash");
        verify(accessTokenGenerator).generate(userId);
        verify(transaction).execute(any());
        InOrder order = inOrder(repository, familyRepository);
        order.verify(repository).findByTokenHash("old-hash");
        order.verify(familyRepository).findByIdForUpdate(familyId);
        order.verify(repository).findByTokenHashForUpdate("old-hash");
    }

    @Test
    void shouldNeverSendRawTokenToRepository() {
        RefreshToken current = token(UUID.randomUUID(), UUID.randomUUID(), NOW.plusSeconds(60), null, null, "old-hash");
        when(hasher.hash("old-raw")).thenReturn("old-hash");
        when(hasher.hash("new-raw")).thenReturn("new-hash");
        when(repository.findByTokenHashForUpdate("old-hash")).thenReturn(Optional.of(current));
        stubFamily(current);
        when(tokenGenerator.generate()).thenReturn("new-raw");
        when(accessTokenGenerator.generate(current.getUserId())).thenReturn("access");

        useCase.execute("old-raw");

        ArgumentCaptor<RefreshToken> previous = ArgumentCaptor.forClass(RefreshToken.class);
        ArgumentCaptor<RefreshToken> replacement = ArgumentCaptor.forClass(RefreshToken.class);
        verify(repository).persistRotation(previous.capture(), replacement.capture());
        assertThat(previous.getValue().getTokenHash()).isNotEqualTo("old-raw");
        assertThat(replacement.getValue().getTokenHash()).isNotEqualTo("new-raw");
    }

    @Test
    void shouldRejectUnknownToken() {
        when(hasher.hash("raw")).thenReturn("hash");
        when(repository.findByTokenHashForUpdate("hash")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> useCase.execute("raw"))
                .isInstanceOf(InvalidRefreshTokenException.class);
        verifyNoInteractions(tokenGenerator, accessTokenGenerator);
    }

    @Test
    void shouldRejectWhenFamilyDoesNotExist() {
        UUID familyId = UUID.randomUUID();
        RefreshToken current = token(UUID.randomUUID(), familyId, NOW.plusSeconds(60), null, null, "hash");
        when(hasher.hash("raw")).thenReturn("hash");
        when(repository.findByTokenHash("hash")).thenReturn(Optional.of(current));
        when(familyRepository.findByIdForUpdate(familyId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> useCase.execute("raw"))
                .isInstanceOf(InvalidRefreshTokenException.class);
        verify(repository, never()).findByTokenHashForUpdate(anyString());
    }

    @Test
    void shouldRejectWhenFamilyIsRevokedEvenIfTokenIsActive() {
        UUID familyId = UUID.randomUUID();
        RefreshToken current = token(UUID.randomUUID(), familyId, NOW.plusSeconds(60), null, null, "hash");
        when(hasher.hash("raw")).thenReturn("hash");
        when(repository.findByTokenHash("hash")).thenReturn(Optional.of(current));
        when(familyRepository.findByIdForUpdate(familyId)).thenReturn(Optional.of(
                new RefreshTokenFamily(familyId, current.getUserId(), at(NOW.minusSeconds(60)),
                        at(NOW.plusSeconds(60)), at(NOW.minusSeconds(1)))
        ));

        assertThatThrownBy(() -> useCase.execute("raw"))
                .isInstanceOf(InvalidRefreshTokenException.class);
        verify(repository, never()).findByTokenHashForUpdate(anyString());
        verifyNoInteractions(tokenGenerator, accessTokenGenerator);
    }

    @Test
    void shouldRejectExpiredTokenUsingInjectedClock() {
        RefreshToken current = token(UUID.randomUUID(), UUID.randomUUID(), NOW, null, null, "hash");
        when(hasher.hash("raw")).thenReturn("hash");
        stubFamily(current);
        when(repository.findByTokenHashForUpdate("hash")).thenReturn(Optional.of(current));

        assertThatThrownBy(() -> useCase.execute("raw"))
                .isInstanceOf(InvalidRefreshTokenException.class);
        verifyNoInteractions(tokenGenerator, accessTokenGenerator);
    }

    @Test
    void shouldRejectRevokedTokenWithoutTreatingItAsReuse() {
        RefreshToken current = token(UUID.randomUUID(), UUID.randomUUID(), NOW.plusSeconds(60), NOW, null, "hash");
        when(hasher.hash("raw")).thenReturn("hash");
        stubFamily(current);
        when(repository.findByTokenHashForUpdate("hash")).thenReturn(Optional.of(current));

        assertThatThrownBy(() -> useCase.execute("raw"))
                .isInstanceOf(InvalidRefreshTokenException.class)
                .isNotInstanceOf(RefreshTokenReuseException.class);
        verify(repository, never()).revokeFamily(any(), any());
    }

    @Test
    void shouldRevokeFamilyWhenRotatedTokenIsReused() {
        UUID familyId = UUID.randomUUID();
        RefreshToken current = token(UUID.randomUUID(), familyId, NOW.plusSeconds(60), NOW,
                UUID.randomUUID(), "hash");
        when(hasher.hash("raw")).thenReturn("hash");
        stubFamily(current);
        when(repository.findByTokenHashForUpdate("hash")).thenReturn(Optional.of(current));

        assertThatThrownBy(() -> useCase.execute("raw"))
                .isInstanceOf(RefreshTokenReuseException.class)
                .isInstanceOf(InvalidRefreshTokenException.class);
        verify(familyRepository).revoke(familyId, at(NOW), RefreshTokenFamilyRevocationReason.REUSED);
        verify(repository, never()).persistRotation(any(), any());
        verifyNoInteractions(tokenGenerator, accessTokenGenerator);
    }

    @Test
    void shouldKeepFamilyAndUseCorrectUserWhenRotating() {
        UUID userId = UUID.randomUUID();
        UUID familyId = UUID.randomUUID();
        RefreshToken current = token(userId, familyId, NOW.plusSeconds(60), null, null, "old-hash");
        when(hasher.hash("old")).thenReturn("old-hash");
        when(hasher.hash("new")).thenReturn("new-hash");
        when(repository.findByTokenHashForUpdate("old-hash")).thenReturn(Optional.of(current));
        stubFamily(current);
        when(tokenGenerator.generate()).thenReturn("new");
        when(accessTokenGenerator.generate(userId)).thenReturn("access");

        useCase.execute("old");

        ArgumentCaptor<RefreshToken> replacement = ArgumentCaptor.forClass(RefreshToken.class);
        verify(repository).persistRotation(any(), replacement.capture());
        assertThat(replacement.getValue().getFamilyId()).isEqualTo(familyId);
        verify(accessTokenGenerator).generate(userId);
    }

    private RefreshToken token(
            UUID userId,
            UUID familyId,
            Instant expiresAt,
            Instant revokedAt,
            UUID replacedById,
            String hash
    ) {
        return new RefreshToken(
                UUID.randomUUID(), userId, familyId, hash,
                at(expiresAt), at(NOW.minusSeconds(30)),
                revokedAt == null ? null : at(revokedAt), replacedById
        );
    }

    private OffsetDateTime at(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private void stubFamily(RefreshToken token) {
        when(repository.findByTokenHash(token.getTokenHash())).thenReturn(Optional.of(token));
        when(familyRepository.findByIdForUpdate(token.getFamilyId())).thenReturn(Optional.of(
                new RefreshTokenFamily(
                        token.getFamilyId(), token.getUserId(), at(NOW.minusSeconds(60)),
                        at(NOW.plus(Duration.ofDays(30))), null
                )
        ));
    }
}
