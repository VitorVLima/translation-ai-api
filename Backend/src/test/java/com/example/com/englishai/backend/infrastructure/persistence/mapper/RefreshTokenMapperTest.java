package com.example.com.englishai.backend.infrastructure.persistence.mapper;

import com.example.com.englishai.backend.domain.authentication.RefreshToken;
import com.example.com.englishai.backend.domain.authentication.TokenRevocationReason;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenEntity;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class RefreshTokenMapperTest {

    private final RefreshTokenMapper mapper = new RefreshTokenMapper();

    @Test
    void shouldMapAllPersistedFieldsWithoutRawToken() {
        UUID id = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID familyId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        RefreshToken token = new RefreshToken(
                id, userId, familyId, "hash", now.plusDays(30), now, null, null
        );

        RefreshTokenEntity entity = mapper.toEntity(token);
        RefreshToken mapped = mapper.toDomain(entity);

        assertThat(entity.getId()).isEqualTo(id);
        assertThat(entity.getUserId()).isEqualTo(userId);
        assertThat(entity.getFamilyId()).isEqualTo(familyId);
        assertThat(entity.getTokenHash()).isEqualTo("hash");
        assertThat(entity.getRevokedAt()).isNull();
        assertThat(mapped.getUserId()).isEqualTo(userId);
        assertThat(mapped.getFamilyId()).isEqualTo(familyId);
        assertThat(mapped.getTokenHash()).isEqualTo("hash");
    }

    @Test
    void shouldMapRevocationReasonAsStringEnum() {
        RefreshToken token = new RefreshToken(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "hash", OffsetDateTime.now().plusDays(1), OffsetDateTime.now(),
                OffsetDateTime.now(), UUID.randomUUID(), TokenRevocationReason.ROTATED);

        RefreshToken mapped = mapper.toDomain(mapper.toEntity(token));

        assertThat(mapped.getRevocationReason()).isEqualTo(TokenRevocationReason.ROTATED);
    }
}
