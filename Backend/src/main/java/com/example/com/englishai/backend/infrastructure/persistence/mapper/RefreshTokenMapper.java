package com.example.com.englishai.backend.infrastructure.persistence.mapper;

import com.example.com.englishai.backend.domain.authentication.RefreshToken;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenEntity;
import org.springframework.stereotype.Component;

@Component
public class RefreshTokenMapper {

    public RefreshToken toDomain(RefreshTokenEntity entity) {
        return new RefreshToken(
                entity.getId(),
                entity.getUserId(),
                entity.getFamilyId(),
                entity.getTokenHash(),
                entity.getExpiresAt(),
                entity.getCreatedAt(),
                entity.getRevokedAt(),
                entity.getReplacedById(), entity.getRevocationReason()
        );
    }

    public RefreshTokenEntity toEntity(RefreshToken refreshToken) {
        return new RefreshTokenEntity(
                refreshToken.getId(),
                refreshToken.getUserId(),
                refreshToken.getFamilyId(),
                refreshToken.getTokenHash(),
                refreshToken.getExpiresAt(),
                refreshToken.getCreatedAt(),
                refreshToken.getRevokedAt(),
                refreshToken.getReplacedById(), refreshToken.getRevocationReason()
        );
    }
}
