package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.application.authentication.LoginUser;
import com.example.com.englishai.backend.application.authentication.RegisterUser;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.infrastructure.security.JwtTokenGenerator;
import com.example.com.englishai.backend.infrastructure.security.JwtTokenValidator;
import com.example.com.englishai.backend.infrastructure.security.SecurityConfig;
import com.example.com.englishai.backend.presentation.rest.auth.AuthController;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = {AuthController.class, JwtSecurityIntegrationTest.ProtectedController.class})
@Import({SecurityConfig.class, JwtSecurityIntegrationTest.TokenConfiguration.class,
        JwtSecurityIntegrationTest.ProtectedController.class})
class JwtSecurityIntegrationTest {

    private static final String SECRET = randomSecret();
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-09-09T12:00:00Z"), ZoneOffset.UTC);
    private final MockMvc mockMvc;

    @MockitoBean
    private LoginUser loginUser;
    @MockitoBean
    private RegisterUser registerUser;

    @Autowired
    JwtSecurityIntegrationTest(MockMvc mockMvc) {
        this.mockMvc = mockMvc;
    }

    @Test
    void shouldAllowValidTokenOnlyForCurrentRequestWithoutSession() throws Exception {
        UUID userId = UUID.randomUUID();
        String token = new JwtTokenGenerator(SECRET, Duration.ofMinutes(15), CLOCK).generate(userId);

        mockMvc.perform(get("/test/protected").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(content().string(userId.toString()))
                .andExpect(cookie().doesNotExist("JSESSIONID"))
                .andExpect(result -> assertThat(result.getRequest().getSession(false)).isNull());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        mockMvc.perform(get("/test/protected"))
                .andExpect(status().isUnauthorized())
                .andExpect(unauthenticated())
                .andExpect(content().json("{\"message\":\"Unauthorized\"}"))
                .andExpect(result -> assertThat(result.getRequest().getSession(false)).isNull());
    }

    @ParameterizedTest
    @ValueSource(strings = {"malformed", "expired", "wrong-key"})
    void shouldRejectInvalidTokensWithSameSafeResponse(String scenario) throws Exception {
        String token = switch (scenario) {
            case "expired" -> new JwtTokenGenerator(SECRET, Duration.ofSeconds(1),
                    Clock.offset(CLOCK, Duration.ofMinutes(-1))).generate(UUID.randomUUID());
            case "wrong-key" -> new JwtTokenGenerator(randomSecret(), Duration.ofMinutes(15), CLOCK)
                    .generate(UUID.randomUUID());
            default -> "not-a-jwt";
        };

        mockMvc.perform(get("/test/protected").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(unauthenticated())
                .andExpect(content().json("{\"message\":\"Unauthorized\"}"))
                .andExpect(header().string("WWW-Authenticate", "Bearer"))
                .andExpect(result -> assertThat(result.getRequest().getSession(false)).isNull());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/auth/register", "/api/v1/auth/login"})
    void shouldKeepPostPublicAndOtherMethodsProtected(String path) throws Exception {
        // Validation errors prove that anonymous POST reaches MVC rather than being blocked.
        mockMvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get(path))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void shouldNotAuthenticateWithAnotherAuthorizationScheme() throws Exception {
        mockMvc.perform(get("/test/protected").header("Authorization", "Basic ignored"))
                .andExpect(status().isUnauthorized())
                .andExpect(unauthenticated());
    }

    @RestController
    static class ProtectedController {
        @GetMapping("/test/protected")
        String protectedResource(Authentication authentication) {
            return ((UUID) authentication.getPrincipal()).toString();
        }
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
