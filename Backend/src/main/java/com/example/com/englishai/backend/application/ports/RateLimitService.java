package com.example.com.englishai.backend.application.ports;

import java.time.Duration;

public interface RateLimitService {
    RateLimitDecision tryConsume(String key, int capacity, Duration window);

    record RateLimitDecision(boolean allowed, Duration retryAfter) {
        public static RateLimitDecision permitted() { return new RateLimitDecision(true, Duration.ZERO); }
    }
}
