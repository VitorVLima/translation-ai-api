package com.example.com.englishai.backend.infrastructure.notification;

import com.example.com.englishai.backend.application.ports.EmailSender;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Development adapter. A real provider must be invoked after transaction commit. */
@Component
@ConditionalOnProperty(name = "MAIL_PROVIDER", havingValue = "noop", matchIfMissing = true)
public class NoOpEmailSender implements EmailSender {
    @Override
    public void sendEmailVerificationCode(String recipientEmail, String code) {
        // Intentionally empty: no email provider is configured in this stage.
    }
}
