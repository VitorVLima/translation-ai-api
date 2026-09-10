package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.application.ports.RefreshTokenRepository;
import com.example.com.englishai.backend.domain.authentication.RefreshToken;
import com.example.com.englishai.backend.infrastructure.persistence.mapper.RefreshTokenMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
public class RefreshTokenRepositoryAdapter implements RefreshTokenRepository {

    private final RefreshTokenJpaRepository refreshTokenJpaRepository;
    private final RefreshTokenMapper refreshTokenMapper;

    @PersistenceContext
    private EntityManager entityManager;

    public RefreshTokenRepositoryAdapter(
            RefreshTokenJpaRepository refreshTokenJpaRepository,
            RefreshTokenMapper refreshTokenMapper
    ) {
        this.refreshTokenJpaRepository = refreshTokenJpaRepository;
        this.refreshTokenMapper = refreshTokenMapper;
    }

    @Override
    public RefreshToken save(RefreshToken refreshToken) {
        return refreshTokenMapper.toDomain(
                refreshTokenJpaRepository.save(refreshTokenMapper.toEntity(refreshToken))
        );
    }

    @Override
    public void persistRotation(RefreshToken previousToken, RefreshToken replacementToken) {
        refreshTokenJpaRepository.save(refreshTokenMapper.toEntity(replacementToken));
        refreshTokenJpaRepository.flush();
        refreshTokenJpaRepository.save(refreshTokenMapper.toEntity(previousToken));
    }

    @Override
    public Optional<RefreshToken> findByTokenHash(String tokenHash) {
        return refreshTokenJpaRepository.findByTokenHash(tokenHash)
                .map(refreshTokenMapper::toDomain);
    }

    @Override
    @Transactional
    public Optional<RefreshToken> findByTokenHashForUpdate(String tokenHash) {
        // The non-locking metadata lookup intentionally runs first to discover
        // the family. Clear its managed entity before the definitive locked
        // lookup so a concurrent commit cannot be hidden by JPA's first-level cache.
        if (entityManager != null) {
            entityManager.clear();
        }
        return refreshTokenJpaRepository.findByTokenHashForUpdate(tokenHash)
                .map(refreshTokenMapper::toDomain);
    }

    @Override
    public Optional<RefreshToken> findById(UUID id) {
        return refreshTokenJpaRepository.findById(id)
                .map(refreshTokenMapper::toDomain);
    }

    @Override
    @Transactional
    public void revoke(UUID id, OffsetDateTime revokedAt) {
        refreshTokenJpaRepository.revokeById(id, revokedAt);
    }

    @Override
    @Transactional
    public void revokeFamily(UUID familyId, OffsetDateTime revokedAt) {
        refreshTokenJpaRepository.revokeByFamilyId(familyId, revokedAt);
    }
}
