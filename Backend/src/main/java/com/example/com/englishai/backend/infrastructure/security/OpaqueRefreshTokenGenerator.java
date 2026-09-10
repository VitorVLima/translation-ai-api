package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.ports.RefreshTokenGenerator;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Objects;

public final class OpaqueRefreshTokenGenerator implements RefreshTokenGenerator {

    private static final int TOKEN_BYTES = 32;
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final SecureRandom secureRandom;

    public OpaqueRefreshTokenGenerator() {
        this(new SecureRandom());
    }

    OpaqueRefreshTokenGenerator(SecureRandom secureRandom) {
        this.secureRandom = Objects.requireNonNull(secureRandom, "SecureRandom is required");
    }

    @Override
    public String generate() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return ENCODER.encodeToString(bytes);
    }
}
