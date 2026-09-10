package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.security.HmacEmailVerificationCodeHasher;
import org.junit.jupiter.api.Test;

import java.util.Base64;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EmailVerificationCodeHasherTest {
    private final String secret = Base64.getEncoder().encodeToString(new byte[32]);

    @Test
    void shouldBeDeterministicAndOpaque() {
        HmacEmailVerificationCodeHasher hasher = new HmacEmailVerificationCodeHasher(secret);
        assertThat(hasher.hash("000042")).isEqualTo(hasher.hash("000042")).hasSize(64);
        assertThat(hasher.hash("000042")).isNotEqualTo(hasher.hash("000043"));
    }

    @Test
    void differentSecretsProduceDifferentHashes() {
        byte[] otherBytes = new byte[32];
        Arrays.fill(otherBytes, (byte) 1);
        String other = Base64.getEncoder().encodeToString(otherBytes);
        assertThat(new HmacEmailVerificationCodeHasher(secret).hash("123456"))
                .isNotEqualTo(new HmacEmailVerificationCodeHasher(other).hash("123456"));
    }

    @Test
    void invalidSecretIsRejected() {
        assertThatThrownBy(() -> new HmacEmailVerificationCodeHasher("invalid")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new HmacEmailVerificationCodeHasher(Base64.getEncoder().encodeToString(new byte[31])))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
