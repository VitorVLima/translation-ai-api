package com.example.com.englishai.backend.integration.authentication;

import com.example.com.englishai.backend.application.authentication.exception.EmailDeliveryException;
import com.example.com.englishai.backend.application.ports.EmailSender;
import com.example.com.englishai.backend.infrastructure.persistence.repository.EmailVerificationCodeJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.PasswordResetCodeJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.core.env.Environment;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class EmailDeliveryAfterCommitIntegrationTest {
    private static final AtomicInteger CLIENT_IP = new AtomicInteger(10);
    @Autowired private MockMvc mockMvc;
    @Autowired private UserJpaRepository users;
    @Autowired private EmailVerificationCodeJpaRepository verificationCodes;
    @Autowired private PasswordResetCodeJpaRepository resetCodes;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private Environment environment;
    @MockitoBean private EmailSender sender;

    private final ObjectMapper json = new ObjectMapper();
    private final List<UUID> created = new ArrayList<>();

    @Test
    void smtpSocketTimeoutsAreBoundFromApplicationConfiguration() {
        assertThat(environment.getProperty("spring.mail.properties.mail.smtp.connectiontimeout"))
                .isEqualTo("5000");
        assertThat(environment.getProperty("spring.mail.properties.mail.smtp.writetimeout"))
                .isEqualTo("5000");
        assertThat(environment.getProperty("spring.mail.properties.mail.smtp.timeout"))
                .isEqualTo("10000");
    }

    @AfterEach
    void cleanUp() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            for (UUID id : created) users.deleteById(id);
            users.flush();
        });
    }

    @Test
    void registerCommitsBeforeSendingAndVerificationStillWorks() throws Exception {
        String email = uniqueEmail();
        AtomicReference<String> code = new AtomicReference<>();
        doAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            UUID id = users.findByEmail(email).orElseThrow().getId();
            assertThat(verificationCodes.findFirstByUserIdOrderByCreatedAtDesc(id)).isPresent();
            code.set(invocation.getArgument(1));
            return null;
        }).when(sender).sendEmailVerificationCode(anyString(), anyString());

        register(email, 201);
        mockMvc.perform(post("/api/v1/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsBytes(Map.of("email", email, "code", code.get()))))
                .andExpect(status().isNoContent());
        assertThat(users.findByEmail(email).orElseThrow().isEmailVerified()).isTrue();
    }

    @Test
    void registrationDeliveryFailureLeavesCommittedAccountRecoverableByResend() throws Exception {
        String email = uniqueEmail();
        doThrow(new EmailDeliveryException()).when(sender)
                .sendEmailVerificationCode(anyString(), anyString());
        register(email, 503);
        UUID id = users.findByEmail(email).orElseThrow().getId();
        created.add(id);
        assertThat(verificationCodes.findFirstByUserIdOrderByCreatedAtDesc(id)).isPresent();

        reset(sender);
        AtomicReference<String> replacement = new AtomicReference<>();
        doAnswer(invocation -> {
            replacement.set(invocation.getArgument(1));
            return null;
        }).when(sender).sendEmailVerificationCode(anyString(), anyString());
        mockMvc.perform(post("/api/v1/auth/resend-verification").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsBytes(Map.of("email", email))))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/v1/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsBytes(Map.of("email", email, "code", replacement.get()))))
                .andExpect(status().isNoContent());
    }

    @Test
    void ambiguousFailureAfterSmtpAcceptanceKeepsTheCommittedCodeUsable() throws Exception {
        String email = uniqueEmail();
        AtomicReference<String> acceptedCode = new AtomicReference<>();
        doAnswer(invocation -> {
            acceptedCode.set(invocation.getArgument(1));
            throw new EmailDeliveryException();
        }).when(sender).sendEmailVerificationCode(anyString(), anyString());

        register(email, 503);
        created.add(users.findByEmail(email).orElseThrow().getId());
        mockMvc.perform(post("/api/v1/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsBytes(Map.of("email", email, "code", acceptedCode.get()))))
                .andExpect(status().isNoContent());
    }

    @Test
    void resendAndResetCommitBeforeSlowOrFailedDeliveryWithoutAccountEnumeration() throws Exception {
        String email = uniqueEmail();
        register(email, 201);
        UUID id = users.findByEmail(email).orElseThrow().getId();
        reset(sender);

        doAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(verificationCodes.findFirstByUserIdOrderByCreatedAtDesc(id)).isPresent();
            Thread.sleep(150);
            throw new EmailDeliveryException();
        }).when(sender).sendEmailVerificationCode(anyString(), anyString());
        mockMvc.perform(post("/api/v1/auth/resend-verification").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsBytes(Map.of("email", email))))
                .andExpect(status().isNoContent());
        var verificationState = new TransactionTemplate(transactionManager).execute(status ->
                verificationCodes.findByUserIdOrderByCreatedAtDesc(id));
        assertThat(verificationState).hasSize(2);
        assertThat(verificationState.get(0).getInvalidatedAt()).isNull();
        assertThat(verificationState.get(1).getInvalidatedAt()).isNotNull();

        doAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            Integer savedCodes = new TransactionTemplate(transactionManager).execute(status ->
                    resetCodes.findByUserIdOrderByCreatedAtDesc(id).size());
            assertThat(savedCodes).isPositive();
            Thread.sleep(150);
            throw new EmailDeliveryException();
        }).when(sender).sendPasswordResetCode(anyString(), anyString());
        forgot(email);
        forgot(uniqueEmail());
        Integer savedCodes = new TransactionTemplate(transactionManager).execute(status ->
                resetCodes.findByUserIdOrderByCreatedAtDesc(id).size());
        assertThat(savedCodes).isPositive();
    }

    private void register(String email, int expectedStatus) throws Exception {
        String body = json.writeValueAsString(Map.of("email", email, "password", "Strong-pass-123"));
        String response = mockMvc.perform(post("/api/v1/auth/register")
                        .with(request -> {
                            request.setRemoteAddr("192.0.2." + CLIENT_IP.incrementAndGet());
                            return request;
                        })
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus))
                .andReturn().getResponse().getContentAsString();
        if (expectedStatus == 201) {
            JsonNode user = json.readTree(response);
            created.add(UUID.fromString(user.get("id").asText()));
        }
    }

    private void forgot(String email) throws Exception {
        mockMvc.perform(post("/api/v1/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsBytes(Map.of("email", email))))
                .andExpect(status().isNoContent());
    }

    private static String uniqueEmail() {
        return "email-delivery-" + UUID.randomUUID() + "@test.com";
    }
}
