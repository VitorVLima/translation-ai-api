package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenFamilyEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;

public interface RefreshTokenFamilyJpaRepository extends JpaRepository<RefreshTokenFamilyEntity, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select family from RefreshTokenFamilyEntity family where family.id = :id")
    Optional<RefreshTokenFamilyEntity> findByIdForUpdate(@Param("id") UUID id);

    @Modifying
    @Query("update RefreshTokenFamilyEntity family set family.revokedAt = :revokedAt where family.id = :id")
    int revokeById(@Param("id") UUID id, @Param("revokedAt") OffsetDateTime revokedAt);

    @Modifying
    @Query("update RefreshTokenFamilyEntity family set family.revokedAt = :revokedAt, family.revocationReason = :reason where family.id = :id")
    int revokeById(@Param("id") UUID id, @Param("revokedAt") OffsetDateTime revokedAt,
                   @Param("reason") RefreshTokenFamilyRevocationReason reason);
}
