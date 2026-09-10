package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.security.SecureEmailVerificationCodeGenerator;
import org.junit.jupiter.api.Test;

import java.security.SecureRandom;
import java.util.HashSet;

import static org.assertj.core.api.Assertions.assertThat;

class EmailVerificationCodeGeneratorTest {
    @Test
    void shouldGenerateSixDigits() {
        SecureEmailVerificationCodeGenerator generator = new SecureEmailVerificationCodeGenerator();
        for (int i = 0; i < 100; i++) assertThat(generator.generate()).matches("\\d{6}");
    }

    @Test
    void shouldPreserveLeadingZeros() {
        SecureRandom random = new SecureRandom() { @Override public int nextInt(int bound) { return 42; } };
        assertThat(new SecureEmailVerificationCodeGenerator(random).generate()).isEqualTo("000042");
    }

    @Test
    void successiveCallsNormallyProduceDifferentCodes() {
        SecureEmailVerificationCodeGenerator generator = new SecureEmailVerificationCodeGenerator();
        assertThat(new HashSet<>(java.util.stream.IntStream.range(0, 20)
                .mapToObj(i -> generator.generate()).toList())).hasSizeGreaterThan(1);
    }
}
