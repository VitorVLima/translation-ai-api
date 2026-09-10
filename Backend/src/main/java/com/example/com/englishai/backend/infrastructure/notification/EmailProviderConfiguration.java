package com.example.com.englishai.backend.infrastructure.notification;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/** Validates provider selection without exposing provider details to application code. */
@Configuration
public class EmailProviderConfiguration {
    public EmailProviderConfiguration(@Value("${MAIL_PROVIDER:noop}") String provider) {
        if (!"noop".equals(provider) && !"smtp".equals(provider)) {
            throw new IllegalArgumentException("MAIL_PROVIDER must be noop or smtp");
        }
    }
}
