package com.example.com.englishai.backend.integration.authentication;

import com.example.com.englishai.backend.application.ports.EmailSender;
import com.example.com.englishai.backend.application.ports.PasswordEncoder;
import com.example.com.englishai.backend.application.ports.PasswordResetCodeHasher;
import com.example.com.englishai.backend.infrastructure.persistence.entity.PasswordResetCodeEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.PasswordResetCodeJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.Base64;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class SessionBoundAccessTokenIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private UserJpaRepository users;
    @Autowired private PasswordResetCodeJpaRepository resetCodes;
    @Autowired private PasswordResetCodeHasher resetHasher;
    @Autowired private PasswordEncoder passwords;
    @Value("${security.jwt.secret}") private String jwtSecret;
    @MockitoBean private EmailSender emailSender;
    private final ObjectMapper json = new ObjectMapper();
    private UUID userId;
    private String email;

    @AfterEach
    void cleanUp() {
        if (userId != null) users.deleteById(userId);
    }

    @Test
    void logoutRevokesOnlyItsOwnAccessAndRefreshFamily() throws Exception {
        createUser();
        Tokens first = login("Initial-pass-123");
        Tokens second = login("Initial-pass-123");
        protectedRequest(first.access()).andExpect(status().isOk());
        protectedRequest(second.access()).andExpect(status().isOk());

        mvc.perform(post("/api/v1/auth/logout").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsBytes(Map.of("refreshToken", first.refresh()))))
                .andExpect(status().isNoContent());

        protectedRequest(first.access()).andExpect(status().isUnauthorized());
        protectedRequest(second.access()).andExpect(status().isOk());
        refresh(first.refresh(), 401);
        Tokens rotatedSecond = refresh(second.refresh(), 200);
        protectedRequest(rotatedSecond.access()).andExpect(status().isOk());
    }

    @Test
    void refreshRotationKeepsTheFamilyUntilReuseRevokesItsAccessTokens() throws Exception {
        createUser();
        Tokens original = login("Initial-pass-123");
        Tokens otherSession = login("Initial-pass-123");
        Tokens rotated = refresh(original.refresh(), 200);

        assertThat(rotated.access()).isNotBlank();
        protectedRequest(original.access()).andExpect(status().isOk());
        protectedRequest(rotated.access()).andExpect(status().isOk());
        refresh(original.refresh(), 401); // reuse detection revokes the whole original family
        protectedRequest(original.access()).andExpect(status().isUnauthorized());
        protectedRequest(rotated.access()).andExpect(status().isUnauthorized());
        protectedRequest(otherSession.access()).andExpect(status().isOk());
        refresh(rotated.refresh(), 401);
    }

    @Test
    void passwordResetRevokesAccessAndRefreshForAllSessions() throws Exception {
        createUser();
        Tokens first = login("Initial-pass-123");
        Tokens second = login("Initial-pass-123");
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        resetCodes.saveAndFlush(new PasswordResetCodeEntity(UUID.randomUUID(), userId,
                resetHasher.hash("123456"), now, now.plusMinutes(10), null, null, 0, 5));

        mvc.perform(post("/api/v1/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsBytes(Map.of("email", email, "code", "123456",
                                "newPassword", "Changed-pass-456"))))
                .andExpect(status().isNoContent());

        protectedRequest(first.access()).andExpect(status().isUnauthorized());
        protectedRequest(second.access()).andExpect(status().isUnauthorized());
        refresh(first.refresh(), 401);
        refresh(second.refresh(), 401);
        Tokens afterReset = login("Changed-pass-456");
        protectedRequest(afterReset.access()).andExpect(status().isOk());
    }

    @Test
    void legacyAccessIsRejectedButItsActiveRefreshFamilyCanRotate() throws Exception {
        createUser();
        Tokens session = login("Initial-pass-123");
        var now = new Date();
        SignedJWT legacy = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256),
                new JWTClaimsSet.Builder().subject(userId.toString()).issuer("englishai")
                        .audience("englishai-api").claim("token_type", "access")
                        .issueTime(now).expirationTime(Date.from(now.toInstant().plusSeconds(900))).build());
        legacy.sign(new MACSigner(Base64.getDecoder().decode(jwtSecret)));

        protectedRequest(legacy.serialize()).andExpect(status().isUnauthorized());
        Tokens rotated = refresh(session.refresh(), 200);
        protectedRequest(rotated.access()).andExpect(status().isOk());
    }

    private void createUser() {
        userId = UUID.randomUUID();
        email = "session-security-" + userId + "@test.invalid";
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        users.saveAndFlush(new UserEntity(userId, email, "security-test",
                passwords.encode("Initial-pass-123"), now, now, true));
    }

    private Tokens login(String password) throws Exception {
        String body = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsBytes(Map.of("email", email, "password", password))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode response = json.readTree(body);
        return new Tokens(response.path("accessToken").asText(), response.path("refreshToken").asText());
    }

    private Tokens refresh(String token, int expectedStatus) throws Exception {
        var response = mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsBytes(Map.of("refreshToken", token))))
                .andExpect(status().is(expectedStatus)).andReturn().getResponse();
        if (expectedStatus != 200) return null;
        JsonNode body = json.readTree(response.getContentAsString());
        return new Tokens(body.path("accessToken").asText(), body.path("refreshToken").asText());
    }

    private org.springframework.test.web.servlet.ResultActions protectedRequest(String accessToken) throws Exception {
        return mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + accessToken));
    }

    private record Tokens(String access, String refresh) {}
}
