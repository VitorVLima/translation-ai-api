package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.domain.authentication.EmailVerificationCode;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EmailVerificationCodeDomainTest {
    @Test
    void shouldStartUnusedWithConfiguredAttempts() {
        EmailVerificationCode code = new EmailVerificationCode(UUID.randomUUID(), UUID.randomUUID(), "hash",
                OffsetDateTime.now(), OffsetDateTime.now().plusMinutes(10), null, 0, 5);
        assertThat(code.getAttempts()).isZero();
        assertThat(code.getMaxAttempts()).isEqualTo(5);
        assertThat(code.getUsedAt()).isNull();
        assertThat(code.toString()).doesNotContain("hash");
    }

    @Test
    void invalidAttemptConfigurationIsRejected() {
        assertThatThrownBy(() -> new EmailVerificationCode(UUID.randomUUID(), UUID.randomUUID(), "hash",
                OffsetDateTime.now(), OffsetDateTime.now().plusMinutes(1), null, -1, 5))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EmailVerificationCode(UUID.randomUUID(), UUID.randomUUID(), "hash",
                OffsetDateTime.now(), OffsetDateTime.now().plusMinutes(1), null, 0, 0))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
