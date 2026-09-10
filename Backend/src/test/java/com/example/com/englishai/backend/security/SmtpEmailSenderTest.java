package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.application.authentication.exception.EmailDeliveryException;
import com.example.com.englishai.backend.infrastructure.notification.SmtpEmailSender;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SmtpEmailSenderTest {
    @Test
    void sendsConfiguredRecipientSubjectFromAndCodeOnly() {
        JavaMailSender mail = mock(JavaMailSender.class);
        SmtpEmailSender sender = new SmtpEmailSender(mail, "no-reply@englishai.test");

        sender.sendEmailVerificationCode("person@example.com", "123456");

        var captor = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(captor.capture());
        SimpleMailMessage message = captor.getValue();
        assertThat(message.getTo()).containsExactly("person@example.com");
        assertThat(message.getFrom()).isEqualTo("no-reply@englishai.test");
        assertThat(message.getSubject()).isEqualTo("EnglishAI - Código de verificação");
        assertThat(message.getText()).contains("123456");
        assertThat(message.getText()).doesNotContain("password", "hash", "token");
    }

    @Test
    void translatesMailFailureWithoutProviderDetails() {
        JavaMailSender mail = mock(JavaMailSender.class);
        doThrow(new MailSendException("smtp-internal-host")).when(mail).send(any(SimpleMailMessage.class));

        assertThatThrownBy(() -> new SmtpEmailSender(mail, "from@example.com")
                .sendEmailVerificationCode("to@example.com", "123456"))
                .isExactlyInstanceOf(EmailDeliveryException.class)
                .hasMessage("Email delivery failed");
    }
}
