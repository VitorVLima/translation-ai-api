package com.example.com.englishai.backend.infrastructure.persistence.mapper;

import com.example.com.englishai.backend.domain.authentication.EmailVerificationCode;
import com.example.com.englishai.backend.infrastructure.persistence.entity.EmailVerificationCodeEntity;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class EmailVerificationCodeMapperTest {
    private final EmailVerificationCodeMapper mapper = new EmailVerificationCodeMapper();

    @Test
    void shouldMapAllFieldsWithoutRawCode() {
        UUID id = UUID.randomUUID();
        EmailVerificationCode code = new EmailVerificationCode(id, UUID.randomUUID(), "hash-value",
                OffsetDateTime.now(), OffsetDateTime.now().plusMinutes(10), null, 0, 5);
        EmailVerificationCodeEntity entity = mapper.toEntity(code);
        assertThat(entity.getId()).isEqualTo(id);
        assertThat(entity.getCodeHash()).isEqualTo("hash-value");
        assertThat(entity.toString()).doesNotContain("hash-value", "123456");
        assertThat(mapper.toDomain(entity).getMaxAttempts()).isEqualTo(5);
    }
}
