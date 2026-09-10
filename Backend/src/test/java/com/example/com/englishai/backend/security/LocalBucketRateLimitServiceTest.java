package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.security.LocalBucketRateLimitService;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class LocalBucketRateLimitServiceTest {
    @Test
    void shouldAllowCapacityThenRejectWithRetryAfter() {
        LocalBucketRateLimitService service = new LocalBucketRateLimitService(10, Duration.ofMinutes(1));
        for (int i = 0; i < 2; i++) assertThat(service.tryConsume("ip", 2, Duration.ofMinutes(1)).allowed()).isTrue();
        var denied = service.tryConsume("ip", 2, Duration.ofMinutes(1));
        assertThat(denied.allowed()).isFalse();
        assertThat(denied.retryAfter()).isPositive();
    }

    @Test
    void shouldBoundCacheSize() {
        LocalBucketRateLimitService service = new LocalBucketRateLimitService(2, Duration.ofMinutes(1));
        for (int i = 0; i < 100; i++) service.tryConsume("key-" + i, 1, Duration.ofMinutes(1));
        assertThat(service.estimatedSize()).isLessThanOrEqualTo(2);
    }
}
