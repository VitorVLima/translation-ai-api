package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.security.RateLimitKeyGenerator;
import com.example.com.englishai.backend.infrastructure.security.RateLimitConfig;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.assertj.core.api.Assertions.*;

class RateLimitKeyGeneratorTest {
    private final String secret = Base64.getEncoder().encodeToString(new byte[32]);

    @Test
    void shouldNormalizeEmailAndGenerateStableOpaqueKey() {
        RateLimitKeyGenerator generator = new RateLimitKeyGenerator(secret);
        assertThat(generator.accountKey(" User@Test.COM "))
                .isEqualTo(generator.accountKey("user@test.com"))
                .doesNotContain("user@test.com");
    }

    @Test
    void shouldRejectInvalidOrShortSecret() {
        assertThatThrownBy(() -> new RateLimitKeyGenerator("invalid")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RateLimitKeyGenerator(Base64.getEncoder().encodeToString(new byte[31])))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void shouldRejectMissingConfigurationInsteadOfUsingKnownFallback() {
        assertThatThrownBy(() -> new RateLimitConfig().rateLimitKeyGenerator(""))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
