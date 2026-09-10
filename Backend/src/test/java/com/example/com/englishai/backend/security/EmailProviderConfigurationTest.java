package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.notification.EmailProviderConfiguration;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EmailProviderConfigurationTest {
    @Test
    void acceptsNoopAndSmtp() {
        assertThatCode(() -> new EmailProviderConfiguration("noop")).doesNotThrowAnyException();
        assertThatCode(() -> new EmailProviderConfiguration("smtp")).doesNotThrowAnyException();
    }

    @Test
    void rejectsUnknownProvider() {
        assertThatThrownBy(() -> new EmailProviderConfiguration("other"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
