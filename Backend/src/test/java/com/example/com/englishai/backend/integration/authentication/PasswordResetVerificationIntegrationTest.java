package com.example.com.englishai.backend.integration.authentication;

import com.example.com.englishai.backend.application.ports.EmailSender;
import com.example.com.englishai.backend.infrastructure.persistence.entity.PasswordResetCodeEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import jakarta.persistence.EntityManager;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class PasswordResetVerificationIntegrationTest {

    @Autowired private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();
    @Autowired private UserJpaRepository users;
    @Autowired private PasswordResetCodeJpaRepository resetCodes;
    @Autowired private EntityManager entityManager;
    @Autowired private PlatformTransactionManager transactionManager;
    @MockitoBean private EmailSender emailSender;

    private UUID userId;

    @AfterEach
    void cleanUp() {
        if (userId == null) return;
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            users.deleteById(userId);
            users.flush();
        });
    }

    @Test
    void registerResetAndLoginVerifiesEmailOnlyAfterSuccessfulPasswordReset() throws Exception {
        String unique = UUID.randomUUID().toString();
        String email = "password-reset-" + unique + "@test.com";
        String username = "reset-" + unique;
        String originalPassword = "Original-pass-123";
        String newPassword = "New-password-456";

        String registerResponse = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(java.util.Map.of(
                                "email", email, "username", username, "password", originalPassword))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode registeredUser = objectMapper.readTree(registerResponse);
        userId = UUID.fromString(registeredUser.get("id").asText());
        assertThat(readPersistedUser().isEmailVerified()).isFalse();
        reset(emailSender);

        requestReset(email);
        assertThat(readPersistedUser().isEmailVerified())
                .as("requesting a reset must not verify the account")
                .isFalse();
        String invalidCode = "000000".equals(capturedResetCode(email)) ? "999999" : "000000";
        reset(emailSender);
        mockMvc.perform(post("/api/v1/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(resetBody(email, invalidCode, newPassword)))
                .andExpect(status().isBadRequest());
        assertThat(readPersistedUser().isEmailVerified())
                .as("an invalid reset code must not verify the account")
                .isFalse();

        requestReset(email);
        String expiredCode = capturedResetCode(email);
        expireLatestResetCode();
        reset(emailSender);
        mockMvc.perform(post("/api/v1/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(resetBody(email, expiredCode, newPassword)))
                .andExpect(status().isBadRequest());
        assertThat(readPersistedUser().isEmailVerified())
                .as("an expired reset code must not verify the account")
                .isFalse();

        requestReset(email);
        String validCode = capturedResetCode(email);
        reset(emailSender);
        String wrongValidationCode = "000000".equals(validCode) ? "999999" : "000000";
        mockMvc.perform(post("/api/v1/auth/validate-reset-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(java.util.Map.of("email", email, "code", wrongValidationCode))))
                .andExpect(status().isBadRequest());
        int attempts = new TransactionTemplate(transactionManager).execute(status ->
                resetCodes.findByUserIdOrderByCreatedAtDesc(userId).getFirst().getAttempts());
        assertThat(attempts).isEqualTo(1);
        mockMvc.perform(post("/api/v1/auth/validate-reset-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(java.util.Map.of("email", email, "code", validCode))))
                .andExpect(status().isNoContent());
        assertThat(readPersistedUser().isEmailVerified())
                .as("validating a code must not change the account")
                .isFalse();
        mockMvc.perform(post("/api/v1/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(resetBody(email, validCode, newPassword)))
                .andExpect(status().isNoContent());

        UserEntity persistedAfterReset = readPersistedUser();
        assertThat(persistedAfterReset.isEmailVerified())
                .as("email_verified must be committed to the users row")
                .isTrue();
        assertThat(persistedAfterReset.getPasswordHash()).isNotEqualTo(originalPassword);

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(java.util.Map.of(
                                "email", email, "password", newPassword))))
                .andExpect(status().isOk());
    }

    private void requestReset(String email) throws Exception {
        mockMvc.perform(post("/api/v1/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(java.util.Map.of("email", email))))
                .andExpect(status().isNoContent());
    }

    private String capturedResetCode(String email) {
        org.mockito.ArgumentCaptor<String> code = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendPasswordResetCode(eq(email), code.capture());
        return code.getValue();
    }

    private byte[] resetBody(String email, String code, String password) throws Exception {
        return objectMapper.writeValueAsBytes(java.util.Map.of(
                "email", email, "code", code, "newPassword", password));
    }

    private UserEntity readPersistedUser() {
        entityManager.clear();
        return users.findById(userId).orElseThrow();
    }

    private void expireLatestResetCode() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            PasswordResetCodeEntity latest = resetCodes.findByUserIdOrderByCreatedAtDesc(userId).getFirst();
            resetCodes.saveAndFlush(new PasswordResetCodeEntity(
                    latest.getId(), latest.getUserId(), latest.getCodeHash(), latest.getCreatedAt(),
                    OffsetDateTime.now().minusSeconds(1), latest.getUsedAt(), latest.getInvalidatedAt(),
                    latest.getAttempts(), latest.getMaxAttempts()));
            entityManager.clear();
        });
    }
}
