package com.example.com.englishai.backend.infrastructure.notification;

import com.example.com.englishai.backend.application.authentication.exception.EmailDeliveryException;
import com.example.com.englishai.backend.application.ports.EmailSender;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/** SMTP adapter. The provider call is intentionally outside application concerns. */
@Component
@ConditionalOnProperty(name = "MAIL_PROVIDER", havingValue = "smtp")
public class SmtpEmailSender implements EmailSender {
    private static final String SUBJECT = "EnglishAI - Código de verificação";

    private final JavaMailSender mailSender;
    private final String from;

    public SmtpEmailSender(JavaMailSender mailSender,
                           @Value("${MAIL_FROM}") String from) {
        if (from == null || from.isBlank()) {
            throw new IllegalArgumentException("MAIL_FROM must be configured for SMTP");
        }
        this.mailSender = mailSender;
        this.from = from;
    }

    @Override
    public void sendEmailVerificationCode(String recipientEmail, String code) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(recipientEmail);
        message.setSubject(SUBJECT);
        message.setText("Seu código de verificação é:\n\n" + code
                + "\n\nEste código expira em 10 minutos.\n\n"
                + "Se você não solicitou este cadastro, ignore este e-mail.");
        try {
            mailSender.send(message);
        } catch (MailException exception) {
            throw new EmailDeliveryException();
        }
    }
}
