package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.ports.GoogleLoginNonce;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;

@Component
public class LocalGoogleLoginNonce implements GoogleLoginNonce {
    private final Cache<String, Boolean> nonces;
    private final SecureRandom random = new SecureRandom();
    public LocalGoogleLoginNonce(@Value("${SECURITY_GOOGLE_NONCE_TTL_SECONDS:300}") long ttl,
                                 @Value("${SECURITY_GOOGLE_NONCE_CACHE_MAX_SIZE:10000}") long maxSize) {
        if (ttl <= 0 || maxSize <= 0) throw new IllegalArgumentException("Google nonce cache settings must be positive");
        nonces = Caffeine.newBuilder().expireAfterWrite(Duration.ofSeconds(ttl)).maximumSize(maxSize).build();
    }
    public String issue() {
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String nonce = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        nonces.put(nonce, Boolean.TRUE); return nonce;
    }
    public boolean consume(String nonce) { return nonce != null && nonces.asMap().remove(nonce) != null; }
}
