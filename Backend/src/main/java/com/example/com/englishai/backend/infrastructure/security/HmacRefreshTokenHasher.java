package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.ports.RefreshTokenHasher;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Objects;

public final class HmacRefreshTokenHasher implements RefreshTokenHasher {

    private static final String ALGORITHM = "HmacSHA256";
    private static final int MINIMUM_KEY_BYTES = 32;

    private final byte[] key;

    public HmacRefreshTokenHasher(String base64Secret) {
        this.key = decodeSecret(base64Secret);
    }

    @Override
    public String hash(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new IllegalArgumentException("Refresh token is required");
        }

        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(key, ALGORITHM));
            return HexFormat.of().formatHex(mac.doFinal(refreshToken.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to derive refresh token identifier", exception);
        }
    }

    private static byte[] decodeSecret(String base64Secret) {
        if (base64Secret == null || base64Secret.isBlank()) {
            throw new IllegalArgumentException("Refresh token hash secret is required");
        }

        final byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(base64Secret);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Refresh token hash secret must be valid Base64", exception);
        }
        if (decoded.length < MINIMUM_KEY_BYTES) {
            throw new IllegalArgumentException(
                    "Refresh token hash secret must contain at least 32 decoded bytes"
            );
        }
        return decoded;
    }
}
