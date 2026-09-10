package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.security.RefreshTokenConfig;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RefreshTokenConfigTest {
    private final RefreshTokenConfig config = new RefreshTokenConfig();

    @Test
    void shouldRespectConfiguredDurations() {
        assertThat(config.refreshTokenExpiration(604800)).isEqualTo(Duration.ofDays(7));
        assertThat(config.refreshTokenFamilyMaxLifetime(2592000)).isEqualTo(Duration.ofDays(30));
        assertThat(config.refreshTokenExpiration(120)).isEqualTo(Duration.ofSeconds(120));
        assertThat(config.refreshTokenFamilyMaxLifetime(3600)).isEqualTo(Duration.ofHours(1));
    }

    @Test
    void shouldRejectNonPositiveDurations() {
        assertThatThrownBy(() -> config.refreshTokenExpiration(0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> config.refreshTokenExpiration(-1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> config.refreshTokenFamilyMaxLifetime(0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> config.refreshTokenFamilyMaxLifetime(-1)).isInstanceOf(IllegalArgumentException.class);
    }
}
