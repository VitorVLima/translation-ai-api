package com.example.com.englishai.backend.integration.authentication;

import com.example.com.englishai.backend.application.ports.EmailSender;
import com.example.com.englishai.backend.application.ports.EmailVerificationCodeHasher;
import com.example.com.englishai.backend.infrastructure.persistence.entity.EmailVerificationCodeEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.PasswordResetCodeEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.EmailVerificationCodeJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.PasswordResetCodeJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "SECURITY_RATE_LIMIT_VERIFY_EMAIL_IP_CAPACITY=20",
        "SECURITY_RATE_LIMIT_VERIFY_EMAIL_ACCOUNT_CAPACITY=20",
        "SECURITY_RATE_LIMIT_FORGOT_PASSWORD_IP_CAPACITY=10",
        "SECURITY_RATE_LIMIT_FORGOT_PASSWORD_ACCOUNT_CAPACITY=10"
})
class AuthenticationSecurityRegressionIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private UserJpaRepository users;
    @Autowired private EmailVerificationCodeJpaRepository verificationCodes;
    @Autowired private PasswordResetCodeJpaRepository resetCodes;
    @Autowired private EmailVerificationCodeHasher verificationHasher;
    @Autowired private PlatformTransactionManager transactionManager;
    @MockitoBean private EmailSender emailSender;

    private UUID userId;
    private final List<UUID> createdUsers = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        if (!createdUsers.isEmpty()) {
            new TransactionTemplate(transactionManager).executeWithoutResult(ignored ->
                    createdUsers.forEach(users::deleteById));
        }
    }

    @Test
    void invalidVerificationAttemptsCommitAndExhaustCode() throws Exception {
        String email = createUser(false);
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        UUID codeId = UUID.randomUUID();
        verificationCodes.saveAndFlush(new EmailVerificationCodeEntity(codeId, userId,
                verificationHasher.hash("123456"), now, now.plusMinutes(10), null, 0, 5));

        for (int expected = 1; expected <= 5; expected++) {
            mvc.perform(post("/api/v1/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"" + email + "\",\"code\":\"654321\"}"))
                    .andExpect(status().isBadRequest());
            assertThat(verificationCodes.findById(codeId).orElseThrow().getAttempts()).isEqualTo(expected);
        }

        mvc.perform(post("/api/v1/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"code\":\"123456\"}"))
                .andExpect(status().isBadRequest());
        assertThat(users.findById(userId).orElseThrow().isEmailVerified()).isFalse();
        assertThat(verificationCodes.findById(codeId).orElseThrow().getAttempts()).isEqualTo(5);

        // Verification must not spend the login bucket for this identifier.
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"invalid\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void forgotPasswordKeepsPublicResponseAndEnforcesPersistedCooldown() throws Exception {
        String email = createUser(true);
        String absent = "absent-" + UUID.randomUUID() + "@test.invalid";
        clearInvocations(emailSender);

        var first = mvc.perform(post("/api/v1/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isNoContent()).andReturn().getResponse();
        var missing = mvc.perform(post("/api/v1/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + absent + "\"}"))
                .andExpect(status().isNoContent()).andReturn().getResponse();
        assertThat(first.getContentAsString()).isEqualTo(missing.getContentAsString());
        assertThat(resetCodeCount()).isEqualTo(1);
        verify(emailSender, times(1)).sendPasswordResetCode(eq(email), anyString());
        verify(emailSender, never()).sendPasswordResetCode(eq(absent), anyString());

        mvc.perform(post("/api/v1/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isNoContent());
        assertThat(resetCodeCount()).isEqualTo(1);
        verify(emailSender, times(1)).sendPasswordResetCode(eq(email), anyString());

        new TransactionTemplate(transactionManager).executeWithoutResult(ignored -> {
            PasswordResetCodeEntity latest = resetCodes.findByUserIdOrderByCreatedAtDesc(userId).getFirst();
            resetCodes.saveAndFlush(new PasswordResetCodeEntity(latest.getId(), latest.getUserId(),
                    latest.getCodeHash(), OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(2),
                    latest.getExpiresAt(), latest.getUsedAt(), latest.getInvalidatedAt(),
                    latest.getAttempts(), latest.getMaxAttempts()));
        });
        mvc.perform(post("/api/v1/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isNoContent());
        assertThat(resetCodeCount()).isEqualTo(2);
        verify(emailSender, times(2)).sendPasswordResetCode(eq(email), anyString());
    }

    @Test
    void verificationContractDoesNotDistinguishVerifiedMissingAndWrongCode() throws Exception {
        String verifiedEmail = createUser(true);
        String pendingEmail = createUser(false);
        UUID pendingId = userId;
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        verificationCodes.saveAndFlush(new EmailVerificationCodeEntity(UUID.randomUUID(), pendingId,
                verificationHasher.hash("123456"), now, now.plusMinutes(10), null, 0, 5));

        var verifiedResponse = mvc.perform(post("/api/v1/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + verifiedEmail + "\",\"code\":\"654321\"}"))
                .andExpect(status().isBadRequest()).andReturn().getResponse();
        var missingResponse = mvc.perform(post("/api/v1/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"missing-" + UUID.randomUUID() + "@test.invalid\",\"code\":\"654321\"}"))
                .andExpect(status().isBadRequest()).andReturn().getResponse();
        var wrongResponse = mvc.perform(post("/api/v1/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + pendingEmail + "\",\"code\":\"654321\"}"))
                .andExpect(status().isBadRequest()).andReturn().getResponse();
        assertThat(verifiedResponse.getContentAsString()).isEqualTo(missingResponse.getContentAsString())
                .isEqualTo(wrongResponse.getContentAsString());

        mvc.perform(post("/api/v1/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + pendingEmail + "\",\"code\":\"123456\"}"))
                .andExpect(status().isNoContent());
        assertThat(users.findById(pendingId).orElseThrow().isEmailVerified()).isTrue();
        mvc.perform(post("/api/v1/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + pendingEmail + "\",\"code\":\"123456\"}"))
                .andExpect(status().isBadRequest());
    }

    private String createUser(boolean verified) {
        userId = UUID.randomUUID();
        createdUsers.add(userId);
        String email = "security-test-" + userId + "@test.invalid";
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        users.saveAndFlush(new UserEntity(userId, email, "security-test", "test-hash", now, now, verified));
        return email;
    }

    private int resetCodeCount() {
        return new TransactionTemplate(transactionManager).execute(ignored ->
                resetCodes.findByUserIdOrderByCreatedAtDesc(userId).size());
    }
}
