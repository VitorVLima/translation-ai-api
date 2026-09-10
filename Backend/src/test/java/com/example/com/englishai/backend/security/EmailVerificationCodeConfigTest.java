package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.security.EmailVerificationCodeConfig;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EmailVerificationCodeConfigTest {
    private final EmailVerificationCodeConfig config = new EmailVerificationCodeConfig();

    @Test
    void shouldRespectExpirationAndAttemptSettings() {
        assertThat(config.emailVerificationCodeExpiration(600)).isEqualTo(Duration.ofMinutes(10));
        assertThat(config.emailVerificationMaxAttempts(5)).isEqualTo(5);
        assertThat(config.emailVerificationCodeHasher(Base64.getEncoder().encodeToString(new byte[32]))).isNotNull();
    }

    @Test
    void shouldRejectInvalidSettings() {
        assertThatThrownBy(() -> config.emailVerificationCodeExpiration(0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> config.emailVerificationMaxAttempts(0)).isInstanceOf(IllegalArgumentException.class);
    }
}
