package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.application.ports.RefreshTokenFamilyRepository;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamily;
import com.example.com.englishai.backend.infrastructure.persistence.mapper.RefreshTokenFamilyMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;

@Repository
public class RefreshTokenFamilyRepositoryAdapter implements RefreshTokenFamilyRepository {

    private final RefreshTokenFamilyJpaRepository jpaRepository;
    private final RefreshTokenFamilyMapper mapper;

    @PersistenceContext
    private EntityManager entityManager;

    public RefreshTokenFamilyRepositoryAdapter(
            RefreshTokenFamilyJpaRepository jpaRepository,
            RefreshTokenFamilyMapper mapper
    ) {
        this.jpaRepository = jpaRepository;
        this.mapper = mapper;
    }

    @Override
    public RefreshTokenFamily save(RefreshTokenFamily family) {
        return mapper.toDomain(jpaRepository.save(mapper.toEntity(family)));
    }

    @Override
    public Optional<RefreshTokenFamily> findById(UUID id) {
        return jpaRepository.findById(id).map(mapper::toDomain);
    }

    @Override
    @Transactional
    public Optional<RefreshTokenFamily> findByIdForUpdate(UUID id) {
        if (entityManager != null) {
            entityManager.clear();
        }
        return jpaRepository.findByIdForUpdate(id).map(mapper::toDomain);
    }

    @Override
    @Transactional
    public void revoke(UUID id, OffsetDateTime revokedAt) {
        jpaRepository.revokeById(id, revokedAt);
    }

    @Override
    @Transactional
    public void revoke(UUID id, OffsetDateTime revokedAt, RefreshTokenFamilyRevocationReason reason) {
        jpaRepository.revokeById(id, revokedAt, reason);
    }
}
