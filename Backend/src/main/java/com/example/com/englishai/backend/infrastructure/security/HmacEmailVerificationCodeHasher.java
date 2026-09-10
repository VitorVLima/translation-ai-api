package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.ports.EmailVerificationCodeHasher;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

public class HmacEmailVerificationCodeHasher implements EmailVerificationCodeHasher {
    private final byte[] secret;

    public HmacEmailVerificationCodeHasher(String base64Secret) {
        if (base64Secret == null || base64Secret.isBlank()) {
            throw new IllegalArgumentException("Email verification code hash secret is required");
        }
        try {
            this.secret = Base64.getDecoder().decode(base64Secret);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Email verification code hash secret must be valid Base64");
        }
        if (secret.length < 32) {
            throw new IllegalArgumentException("Email verification code hash secret must contain at least 32 bytes");
        }
    }

    @Override
    public String hash(String code) {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("Email verification code is required");
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            StringBuilder result = new StringBuilder(64);
            for (byte value : mac.doFinal(code.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
                result.append("%02x".formatted(value & 0xff));
            }
            return result.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to derive email verification code identifier", exception);
        }
    }
}
