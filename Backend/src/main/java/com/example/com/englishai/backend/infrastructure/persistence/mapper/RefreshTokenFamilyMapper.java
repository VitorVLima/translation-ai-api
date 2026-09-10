package com.example.com.englishai.backend.infrastructure.persistence.mapper;

import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamily;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenFamilyEntity;
import org.springframework.stereotype.Component;

@Component
public class RefreshTokenFamilyMapper {

    public RefreshTokenFamily toDomain(RefreshTokenFamilyEntity entity) {
        return new RefreshTokenFamily(
                entity.getId(), entity.getUserId(), entity.getCreatedAt(),
                entity.getExpiresAt(), entity.getRevokedAt(), entity.getRevocationReason()
        );
    }

    public RefreshTokenFamilyEntity toEntity(RefreshTokenFamily family) {
        return new RefreshTokenFamilyEntity(
                family.getId(), family.getUserId(), family.getCreatedAt(),
                family.getExpiresAt(), family.getRevokedAt(), family.getRevocationReason()
        );
    }
}
