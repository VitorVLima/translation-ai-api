package com.example.com.englishai.backend.infrastructure.security;

import java.util.Base64;

final class JwtSecret {

    private JwtSecret() {
    }

    static byte[] decode(String base64Secret) {
        if (base64Secret == null || base64Secret.isBlank()) {
            throw new IllegalArgumentException("JWT secret is required");
        }

        byte[] key;
        try {
            key = Base64.getDecoder().decode(base64Secret);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("JWT secret must be valid Base64");
        }
        if (key.length < 32) {
            throw new IllegalArgumentException("JWT secret must contain at least 32 decoded bytes");
        }
        return key;
    }
}
