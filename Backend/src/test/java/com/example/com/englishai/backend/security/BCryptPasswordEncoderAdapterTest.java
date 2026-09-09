package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.security.BCryptPasswordEncoderAdapter;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BCryptPasswordEncoderAdapterTest {

    private final BCryptPasswordEncoderAdapter passwordEncoder =
            new BCryptPasswordEncoderAdapter();

    @Test
    void shouldEncodePassword() {

        String rawPassword = "123456";

        String encodedPassword =
                passwordEncoder.encode(rawPassword);

        assertThat(encodedPassword).isNotEqualTo(rawPassword);
        assertThat(encodedPassword).isNotBlank();
    }

    @Test
    void shouldMatchCorrectPassword() {

        String rawPassword = "123456";

        String encodedPassword =
                passwordEncoder.encode(rawPassword);

        boolean matches =
                passwordEncoder.matches(rawPassword, encodedPassword);

        assertThat(matches).isTrue();
    }

    @Test
    void shouldRejectIncorrectPassword() {

        String encodedPassword =
                passwordEncoder.encode("123456");

        boolean matches =
                passwordEncoder.matches("senha-errada", encodedPassword);

        assertThat(matches).isFalse();
    }
}
