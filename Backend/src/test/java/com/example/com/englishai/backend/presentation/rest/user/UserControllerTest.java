package com.example.com.englishai.backend.presentation.rest.user;

import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.application.user.usecase.GetCurrentUser;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.infrastructure.security.JwtTokenGenerator;
import com.example.com.englishai.backend.infrastructure.security.JwtTokenValidator;
import com.example.com.englishai.backend.infrastructure.security.SecurityConfig;
import com.example.com.englishai.backend.presentation.rest.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(UserController.class)
@Import({SecurityConfig.class, GetCurrentUser.class, GlobalExceptionHandler.class,
        UserControllerTest.TokenConfiguration.class})
class UserControllerTest {

    private static final String SECRET = randomSecret();
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-09-09T12:00:00Z"), ZoneOffset.UTC);
    private final MockMvc mockMvc;

    @MockitoBean
    private UserRepository repository;

    @Autowired
    UserControllerTest(MockMvc mockMvc) {
        this.mockMvc = mockMvc;
    }

    @Test
    void shouldReturnOnlyPublicDataForUserIdentifiedByJwt() throws Exception {
        UUID userId = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC);
        User user = new User(userId, "user@test.com", "test-user", "stored-hash", createdAt, createdAt);
        when(repository.findById(userId)).thenReturn(Optional.of(user));

        mockMvc.perform(get("/api/v1/users/me")
                        .header("Authorization", "Bearer " + token(userId))
                        .param("userId", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.email").value("user@test.com"))
                .andExpect(jsonPath("$.username").value("test-user"))
                .andExpect(jsonPath("$.createdAt").value("2026-09-09T12:00:00Z"))
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(cookie().doesNotExist("JSESSIONID"))
                .andExpect(result -> assertThat(result.getRequest().getSession(false)).isNull());

        verify(repository).findById(userId);
        verifyNoMoreInteractions(repository);
    }

    @Test
    void shouldReturnUnauthorizedWithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/users/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().json("{\"message\":\"Unauthorized\"}"));

        verifyNoInteractions(repository);
    }

    @ParameterizedTest
    @ValueSource(strings = {"malformed", "expired", "wrong-key"})
    void shouldRejectInvalidAuthenticationBeforeReadingDatabase(String scenario) throws Exception {
        String invalidToken = switch (scenario) {
            case "expired" -> new JwtTokenGenerator(SECRET, Duration.ofSeconds(1),
                    Clock.offset(CLOCK, Duration.ofMinutes(-1))).generate(UUID.randomUUID());
            case "wrong-key" -> new JwtTokenGenerator(randomSecret(), Duration.ofMinutes(15), CLOCK)
                    .generate(UUID.randomUUID());
            default -> "not-a-jwt";
        };

        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + invalidToken))
                .andExpect(status().isUnauthorized())
                .andExpect(content().json("{\"message\":\"Unauthorized\"}"));

        verifyNoInteractions(repository);
    }

    @Test
    void shouldReturnUnauthorizedWhenAuthenticatedUserNoLongerExists() throws Exception {
        UUID userId = UUID.randomUUID();
        when(repository.findById(userId)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + token(userId)))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", "Bearer"))
                .andExpect(content().json("{\"message\":\"Unauthorized\"}"))
                .andExpect(jsonPath("$.length()").value(1));

        verify(repository).findById(userId);
        verifyNoMoreInteractions(repository);
    }

    private String token(UUID userId) {
        return new JwtTokenGenerator(SECRET, Duration.ofMinutes(15), CLOCK).generate(userId);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TokenConfiguration {
        @Bean
        AuthenticationTokenValidator tokenValidator() {
            return new JwtTokenValidator(SECRET, CLOCK);
        }
    }

    private static String randomSecret() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return Base64.getEncoder().encodeToString(key);
    }
}
