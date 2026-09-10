package com.example.com.englishai.backend.presentation.rest.exception;

import com.example.com.englishai.backend.application.authentication.exception.RateLimitExceededException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;

public final class RateLimitHttpResponse {
    private RateLimitHttpResponse() {
    }

    public static ResponseEntity<ErrorResponse> entity(RateLimitExceededException exception) {
        long seconds = Math.max(1, (exception.getRetryAfter().toMillis() + 999) / 1000);
        return ResponseEntity.status(429)
                .header(HttpHeaders.RETRY_AFTER, Long.toString(seconds))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.PRAGMA, "no-cache")
                .body(new ErrorResponse("Too many requests"));
    }
}
