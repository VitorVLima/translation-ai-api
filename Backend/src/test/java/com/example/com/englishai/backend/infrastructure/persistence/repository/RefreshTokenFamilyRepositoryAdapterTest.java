package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamily;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenFamilyEntity;
import com.example.com.englishai.backend.infrastructure.persistence.mapper.RefreshTokenFamilyMapper;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class RefreshTokenFamilyRepositoryAdapterTest {

    private final RefreshTokenFamilyJpaRepository jpaRepository = mock(RefreshTokenFamilyJpaRepository.class);
    private final RefreshTokenFamilyMapper mapper = mock(RefreshTokenFamilyMapper.class);
    private final RefreshTokenFamilyRepositoryAdapter adapter =
            new RefreshTokenFamilyRepositoryAdapter(jpaRepository, mapper);

    @Test
    void shouldDelegateSaveAndMapping() {
        RefreshTokenFamily family = family();
        RefreshTokenFamilyEntity entity = mock(RefreshTokenFamilyEntity.class);
        when(mapper.toEntity(family)).thenReturn(entity);
        when(jpaRepository.save(entity)).thenReturn(entity);
        when(mapper.toDomain(entity)).thenReturn(family);

        adapter.save(family);

        verify(mapper).toEntity(family);
        verify(jpaRepository).save(entity);
        verify(mapper).toDomain(entity);
    }

    @Test
    void shouldDelegateFindById() {
        UUID id = UUID.randomUUID();
        RefreshTokenFamilyEntity entity = mock(RefreshTokenFamilyEntity.class);
        RefreshTokenFamily family = family();
        when(jpaRepository.findById(id)).thenReturn(Optional.of(entity));
        when(mapper.toDomain(entity)).thenReturn(family);

        adapter.findById(id);

        verify(jpaRepository).findById(id);
        verify(mapper).toDomain(entity);
    }

    @Test
    void shouldDelegateFindByIdForUpdateAndMapFamily() {
        UUID id = UUID.randomUUID();
        RefreshTokenFamilyEntity entity = mock(RefreshTokenFamilyEntity.class);
        RefreshTokenFamily family = family();
        when(jpaRepository.findByIdForUpdate(id)).thenReturn(Optional.of(entity));
        when(mapper.toDomain(entity)).thenReturn(family);

        adapter.findByIdForUpdate(id);

        verify(jpaRepository).findByIdForUpdate(id);
        verify(mapper).toDomain(entity);
        verifyNoMoreInteractions(jpaRepository, mapper);
    }

    @Test
    void shouldReturnEmptyWhenLockedFamilyDoesNotExist() {
        UUID id = UUID.randomUUID();
        when(jpaRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThat(adapter.findByIdForUpdate(id)).isEmpty();

        verify(jpaRepository).findByIdForUpdate(id);
        verifyNoInteractions(mapper);
    }

    @Test
    void shouldDelegateRevocation() {
        UUID id = UUID.randomUUID();
        OffsetDateTime revokedAt = OffsetDateTime.now();

        adapter.revoke(id, revokedAt);

        verify(jpaRepository).revokeById(id, revokedAt);
        verifyNoMoreInteractions(jpaRepository);
    }

    private RefreshTokenFamily family() {
        OffsetDateTime now = OffsetDateTime.now();
        return new RefreshTokenFamily(UUID.randomUUID(), UUID.randomUUID(), now, now.plusDays(30), null);
    }
}
