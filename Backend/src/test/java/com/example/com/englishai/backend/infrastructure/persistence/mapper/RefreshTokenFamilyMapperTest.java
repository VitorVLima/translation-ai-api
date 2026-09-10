package com.example.com.englishai.backend.infrastructure.persistence.mapper;

import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamily;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamilyRevocationReason;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenFamilyEntity;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class RefreshTokenFamilyMapperTest {

    private final RefreshTokenFamilyMapper mapper = new RefreshTokenFamilyMapper();

    @Test
    void shouldMapAllFamilyFields() {
        UUID id = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.parse("2026-01-01T12:00:00Z");
        OffsetDateTime expiresAt = createdAt.plusDays(30);

        RefreshTokenFamily family = new RefreshTokenFamily(id, userId, createdAt, expiresAt, null);
        RefreshTokenFamilyEntity entity = mapper.toEntity(family);
        RefreshTokenFamily mapped = mapper.toDomain(entity);

        assertThat(entity.getId()).isEqualTo(id);
        assertThat(entity.getUserId()).isEqualTo(userId);
        assertThat(entity.getCreatedAt()).isEqualTo(createdAt);
        assertThat(entity.getExpiresAt()).isEqualTo(expiresAt);
        assertThat(entity.getRevokedAt()).isNull();
        assertThat(mapped.getId()).isEqualTo(id);
        assertThat(mapped.getUserId()).isEqualTo(userId);
        assertThat(mapped.getRevokedAt()).isNull();
    }

    @Test
    void shouldMapRevokedAt() {
        OffsetDateTime revokedAt = OffsetDateTime.parse("2026-01-02T12:00:00Z");
        RefreshTokenFamily family = new RefreshTokenFamily(
                UUID.randomUUID(), UUID.randomUUID(), revokedAt.minusDays(1), revokedAt.plusDays(29), revokedAt
        );

        assertThat(mapper.toDomain(mapper.toEntity(family)).getRevokedAt()).isEqualTo(revokedAt);
    }

    @Test
    void shouldMapFamilyRevocationReason() {
        RefreshTokenFamily family = new RefreshTokenFamily(
                UUID.randomUUID(), UUID.randomUUID(), OffsetDateTime.now().minusDays(1),
                OffsetDateTime.now().plusDays(29), OffsetDateTime.now(),
                RefreshTokenFamilyRevocationReason.REUSED);

        assertThat(mapper.toDomain(mapper.toEntity(family)).getRevocationReason())
                .isEqualTo(RefreshTokenFamilyRevocationReason.REUSED);
    }
}
