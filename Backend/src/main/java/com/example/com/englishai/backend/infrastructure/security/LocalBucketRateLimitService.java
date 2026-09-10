package com.example.com.englishai.backend.infrastructure.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import com.example.com.englishai.backend.application.ports.RateLimitService;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

public class LocalBucketRateLimitService implements RateLimitService {
    private final Cache<String, Bucket> buckets;

    public LocalBucketRateLimitService(long maximumSize, Duration ttl) {
        if (maximumSize < 1 || ttl.isZero() || ttl.isNegative()) {
            throw new IllegalArgumentException("Rate limit cache settings must be positive");
        }
        this.buckets = Caffeine.newBuilder().maximumSize(maximumSize)
                .expireAfterAccess(ttl.toNanos(), TimeUnit.NANOSECONDS).build();
    }

    @Override
    public RateLimitDecision tryConsume(String key, int capacity, Duration window) {
        Objects.requireNonNull(key);
        if (capacity < 1 || window.isZero() || window.isNegative()) {
            throw new IllegalArgumentException("Rate limit policy must be positive");
        }
        Bucket bucket = buckets.get(key + ":" + capacity + ":" + window.toNanos(), ignored ->
                Bucket.builder().addLimit(Bandwidth.builder().capacity(capacity)
                        .refillGreedy(capacity, window).build()).build());
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) return RateLimitDecision.permitted();
        long nanos = Math.max(1, probe.getNanosToWaitForRefill());
        return new RateLimitDecision(false, Duration.ofNanos(nanos));
    }

    public long estimatedSize() { buckets.cleanUp(); return buckets.estimatedSize(); }
}
