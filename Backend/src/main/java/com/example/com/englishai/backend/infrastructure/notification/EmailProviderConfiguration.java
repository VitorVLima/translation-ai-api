package com.example.com.englishai.backend.infrastructure.notification;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

/** Validates provider selection without exposing provider details to application code. */
@Configuration
public class EmailProviderConfiguration {
    public EmailProviderConfiguration(Environment environment) {
        String provider = environment.getProperty("MAIL_PROVIDER", "noop");
        if (!"noop".equals(provider) && !"smtp".equals(provider)) {
            throw new IllegalArgumentException("MAIL_PROVIDER must be noop or smtp");
        }
        if (environment.acceptsProfiles(Profiles.of("prod", "production"))) {
            if (!"smtp".equals(provider)) {
                throw new IllegalStateException("Production requires MAIL_PROVIDER=smtp");
            }
            require(environment, "MAIL_HOST");
            require(environment, "MAIL_FROM");
            require(environment, "MAIL_USERNAME");
            require(environment, "MAIL_PASSWORD");
            if (!environment.getProperty("MAIL_SMTP_AUTH", Boolean.class, true)
                    || !environment.getProperty("MAIL_SMTP_STARTTLS_ENABLE", Boolean.class, true)
                    || !environment.getProperty("MAIL_SMTP_STARTTLS_REQUIRED", Boolean.class, true)) {
                throw new IllegalStateException("Production SMTP requires authentication and STARTTLS");
            }
        }
        if ("smtp".equals(provider)) {
            positive(environment, "MAIL_SMTP_CONNECTION_TIMEOUT_MS", 5000);
            positive(environment, "MAIL_SMTP_WRITE_TIMEOUT_MS", 5000);
            positive(environment, "MAIL_SMTP_READ_TIMEOUT_MS", 10000);
        }
    }

    private static void require(Environment environment, String key) {
        String value = environment.getProperty(key);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(key + " must be configured in production");
        }
    }

    private static void positive(Environment environment, String key, int defaultValue) {
        if (environment.getProperty(key, Integer.class, defaultValue) <= 0) {
            throw new IllegalArgumentException(key + " must be positive");
        }
    }
}
