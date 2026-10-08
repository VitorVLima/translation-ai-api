package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.notification.EmailProviderConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EmailProviderConfigurationTest {
    @Test
    void acceptsNoopAndSmtp() {
        assertThatCode(() -> new EmailProviderConfiguration(environment("noop"))).doesNotThrowAnyException();
        assertThatCode(() -> new EmailProviderConfiguration(environment("smtp"))).doesNotThrowAnyException();
    }

    @Test
    void rejectsUnknownProvider() {
        assertThatThrownBy(() -> new EmailProviderConfiguration(environment("other")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void productionRejectsNoopAndMissingSmtpConfiguration() {
        MockEnvironment noop = environment("noop");
        noop.setActiveProfiles("prod");
        assertThatThrownBy(() -> new EmailProviderConfiguration(noop))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MAIL_PROVIDER=smtp");

        MockEnvironment incomplete = environment("smtp");
        incomplete.setActiveProfiles("production");
        assertThatThrownBy(() -> new EmailProviderConfiguration(incomplete))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MAIL_HOST");
    }

    @Test
    void productionAcceptsConfiguredSmtpAndRejectsUnsafeTransportOrTimeout() {
        MockEnvironment ready = environment("smtp").withProperty("MAIL_HOST", "smtp.example.com")
                .withProperty("MAIL_FROM", "from@example.com")
                .withProperty("MAIL_USERNAME", "user")
                .withProperty("MAIL_PASSWORD", "from-secret-store");
        ready.setActiveProfiles("prod");
        assertThatCode(() -> new EmailProviderConfiguration(ready)).doesNotThrowAnyException();

        ready.withProperty("MAIL_SMTP_STARTTLS_REQUIRED", "false");
        assertThatThrownBy(() -> new EmailProviderConfiguration(ready))
                .isInstanceOf(IllegalStateException.class);
        ready.withProperty("MAIL_SMTP_STARTTLS_REQUIRED", "true")
                .withProperty("MAIL_SMTP_READ_TIMEOUT_MS", "0");
        assertThatThrownBy(() -> new EmailProviderConfiguration(ready))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("MAIL_SMTP_READ_TIMEOUT_MS");
    }

    private static MockEnvironment environment(String provider) {
        return new MockEnvironment().withProperty("MAIL_PROVIDER", provider);
    }
}
