package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.domain.authentication.RefreshToken;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenEntity;
import com.example.com.englishai.backend.infrastructure.persistence.mapper.RefreshTokenMapper;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.Optional;

import static org.mockito.Mockito.*;
import org.mockito.InOrder;

class RefreshTokenRepositoryAdapterTest {

    private final RefreshTokenJpaRepository jpaRepository = mock(RefreshTokenJpaRepository.class);
    private final RefreshTokenMapper mapper = mock(RefreshTokenMapper.class);
    private final RefreshTokenRepositoryAdapter adapter =
            new RefreshTokenRepositoryAdapter(jpaRepository, mapper);

    @Test
    void shouldDelegateTokenRevocation() {
        UUID id = UUID.randomUUID();
        OffsetDateTime revokedAt = OffsetDateTime.now();

        adapter.revoke(id, revokedAt);

        verify(jpaRepository).revokeById(id, revokedAt);
        verifyNoMoreInteractions(jpaRepository);
    }

    @Test
    void shouldDelegateFamilyRevocation() {
        UUID familyId = UUID.randomUUID();
        OffsetDateTime revokedAt = OffsetDateTime.now();

        adapter.revokeFamily(familyId, revokedAt);

        verify(jpaRepository).revokeByFamilyId(familyId, revokedAt);
        verifyNoMoreInteractions(jpaRepository);
    }

    @Test
    void shouldDelegateHashLookupWithWriteLock() {
        String hash = "a".repeat(64);
        when(jpaRepository.findByTokenHashForUpdate(hash)).thenReturn(Optional.empty());

        adapter.findByTokenHashForUpdate(hash);

        verify(jpaRepository).findByTokenHashForUpdate(hash);
        verifyNoMoreInteractions(jpaRepository);
    }

    @Test
    void shouldMapSavedToken() {
        RefreshToken token = token();
        RefreshTokenEntity entity = mock(RefreshTokenEntity.class);
        when(mapper.toEntity(token)).thenReturn(entity);
        when(jpaRepository.save(entity)).thenReturn(entity);
        when(mapper.toDomain(entity)).thenReturn(token);

        adapter.save(token);

        verify(mapper).toEntity(token);
        verify(jpaRepository).save(entity);
        verify(mapper).toDomain(entity);
    }

    @Test
    void shouldPersistReplacementFlushAndThenPreviousToken() {
        RefreshToken previous = token();
        RefreshToken replacement = token();
        RefreshTokenEntity previousEntity = mock(RefreshTokenEntity.class);
        RefreshTokenEntity replacementEntity = mock(RefreshTokenEntity.class);
        when(mapper.toEntity(previous)).thenReturn(previousEntity);
        when(mapper.toEntity(replacement)).thenReturn(replacementEntity);

        adapter.persistRotation(previous, replacement);

        InOrder order = inOrder(mapper, jpaRepository);
        order.verify(mapper).toEntity(replacement);
        order.verify(jpaRepository).save(replacementEntity);
        order.verify(jpaRepository).flush();
        order.verify(mapper).toEntity(previous);
        order.verify(jpaRepository).save(previousEntity);
        verifyNoMoreInteractions(jpaRepository);
    }

    private RefreshToken token() {
        OffsetDateTime now = OffsetDateTime.now();
        return new RefreshToken(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "a".repeat(64), now.plusDays(30), now, null, null
        );
    }
}
