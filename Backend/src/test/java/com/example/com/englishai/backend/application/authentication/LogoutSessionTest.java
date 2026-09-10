package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.ports.RefreshTokenFamilyRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenHasher;
import com.example.com.englishai.backend.application.ports.RefreshTokenRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenTransaction;
import com.example.com.englishai.backend.domain.authentication.RefreshToken;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamily;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class LogoutSessionTest {
    private static final Instant NOW = Instant.parse("2026-01-01T12:00:00Z");
    private final RefreshTokenHasher hasher = mock(RefreshTokenHasher.class);
    private final RefreshTokenRepository tokens = mock(RefreshTokenRepository.class);
    private final RefreshTokenFamilyRepository families = mock(RefreshTokenFamilyRepository.class);
    private final RefreshTokenTransaction transaction = mock(RefreshTokenTransaction.class);
    private final LogoutSession logout = new LogoutSession(hasher, tokens, families, transaction,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void shouldRevokeFamilyWithLogoutReasonUsingFamilyThenTokenLocks() {
        UUID familyId = UUID.randomUUID();
        RefreshToken token = token(familyId);
        when(hasher.hash("raw")).thenReturn("hash");
        when(tokens.findByTokenHash("hash")).thenReturn(Optional.of(token));
        when(families.findByIdForUpdate(familyId)).thenReturn(Optional.of(family(familyId, null)));
        when(tokens.findByTokenHashForUpdate("hash")).thenReturn(Optional.of(token));
        when(transaction.execute(any())).thenAnswer(invocation -> {
            Function<RefreshTokenRepository, Object> operation = invocation.getArgument(0);
            return operation.apply(tokens);
        });

        logout.execute("raw");

        verify(families).save(argThat(value -> value.getRevocationReason() == RefreshTokenFamilyRevocationReason.LOGOUT
                && value.getRevokedAt().equals(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC))));
        InOrder order = inOrder(families, tokens);
        order.verify(families).findByIdForUpdate(familyId);
        order.verify(tokens).findByTokenHashForUpdate("hash");
    }

    @Test
    void shouldNotOverwriteReuseRevocationAndShouldBeIdempotent() {
        UUID familyId = UUID.randomUUID();
        RefreshToken token = token(familyId);
        when(hasher.hash("raw")).thenReturn("hash");
        when(tokens.findByTokenHash("hash")).thenReturn(Optional.of(token));
        when(families.findByIdForUpdate(familyId)).thenReturn(Optional.of(
                family(familyId, RefreshTokenFamilyRevocationReason.REUSED)));
        when(transaction.execute(any())).thenAnswer(invocation -> {
            Function<RefreshTokenRepository, Object> operation = invocation.getArgument(0);
            return operation.apply(tokens);
        });

        logout.execute("raw");

        verify(families, never()).save(any());
        verify(tokens, never()).findByTokenHashForUpdate(any());
    }

    @Test
    void shouldIgnoreUnknownOrBlankTokensWithoutPersistence() {
        when(hasher.hash("unknown")).thenReturn("unknown-hash");
        when(tokens.findByTokenHash("unknown-hash")).thenReturn(Optional.empty());

        logout.execute("unknown");
        logout.execute("   ");

        verify(tokens).findByTokenHash("unknown-hash");
        verifyNoInteractions(transaction, families);
    }

    private RefreshToken token(UUID familyId) {
        return new RefreshToken(UUID.randomUUID(), UUID.randomUUID(), familyId, "hash",
                at(NOW.plusSeconds(60)), at(NOW.minusSeconds(60)), null, null);
    }

    private RefreshTokenFamily family(UUID id, RefreshTokenFamilyRevocationReason reason) {
        return new RefreshTokenFamily(id, UUID.randomUUID(), at(NOW.minusSeconds(86400)),
                at(NOW.plusSeconds(30L * 86400)), reason == null ? null : at(NOW.minusSeconds(1)), reason);
    }

    private OffsetDateTime at(Instant instant) { return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC); }
}
