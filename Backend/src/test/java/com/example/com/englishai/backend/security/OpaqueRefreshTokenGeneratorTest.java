package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.security.OpaqueRefreshTokenGenerator;
import org.junit.jupiter.api.Test;

import java.util.Base64;
import java.util.Set;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class OpaqueRefreshTokenGeneratorTest {

    private final OpaqueRefreshTokenGenerator generator = new OpaqueRefreshTokenGenerator();

    @Test
    void shouldGenerateNonEmptyTokenWithExpectedEntropy() {
        String token = generator.generate();

        assertThat(token).isNotBlank();
        assertThat(Base64.getUrlDecoder().decode(token)).hasSize(32);
    }

    @Test
    void shouldGenerateDifferentTokensOnSuccessiveCalls() {
        Set<String> tokens = IntStream.range(0, 100)
                .mapToObj(ignored -> generator.generate())
                .collect(java.util.stream.Collectors.toSet());

        assertThat(tokens).hasSize(100);
    }

    @Test
    void shouldUseUrlSafeBase64WithoutPadding() {
        String token = generator.generate();

        assertThat(token).matches("[A-Za-z0-9_-]+");
        assertThat(token).doesNotContain("=");
        assertThat(token).hasSize(43);
    }
}
