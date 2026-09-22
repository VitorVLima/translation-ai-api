package com.example.com.englishai.backend.presentation.rest.profile;

import com.example.com.englishai.backend.application.admin.CatalogService;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.application.profile.AvatarType;
import com.example.com.englishai.backend.application.profile.EnglishLevel;
import com.example.com.englishai.backend.application.profile.OnboardingStatus;
import com.example.com.englishai.backend.application.profile.ProfileService;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserProfileEntity;
import com.example.com.englishai.backend.infrastructure.security.JwtTokenGenerator;
import com.example.com.englishai.backend.infrastructure.security.JwtTokenValidator;
import com.example.com.englishai.backend.infrastructure.security.SecurityConfig;
import com.example.com.englishai.backend.presentation.rest.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
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
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ProfileController.class)
@Import({SecurityConfig.class, GlobalExceptionHandler.class, ProfileControllerTest.TokenConfiguration.class})
class ProfileControllerTest {
    private static final String SECRET = randomSecret();
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-09-09T12:00:00Z"), ZoneOffset.UTC);

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProfileService service;
    @MockitoBean
    private CatalogService catalog;

    @Test
    void readsTheAuthenticatedUsersPendingProfile() throws Exception {
        UUID owner = UUID.randomUUID();
        when(service.getOrCreate(owner)).thenReturn(profile(owner, OnboardingStatus.PENDING));

        mockMvc.perform(get("/api/v1/users/me/profile").header("Authorization", "Bearer " + token(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.birthDate").value("2000-05-10"))
                .andExpect(jsonPath("$.onboardingStatus").value("PENDING"))
                .andExpect(jsonPath("$.onboardingCompleted").value(false));

        verify(service).getOrCreate(owner);
    }

    @Test
    void updatesOnlyTheAuthenticatedUsersProfileWithBirthDate() throws Exception {
        UUID owner = UUID.randomUUID();
        var updated = profile(owner, OnboardingStatus.COMPLETED);
        when(service.update(eq(owner), eq("Ana"), eq(LocalDate.of(2000, 5, 10)), eq(EnglishLevel.B1), eq(null)))
                .thenReturn(updated);

        mockMvc.perform(put("/api/v1/users/me/profile").header("Authorization", "Bearer " + token(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preferredName\":\"Ana\",\"birthDate\":\"2000-05-10\",\"englishLevel\":\"B1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.onboardingStatus").value("COMPLETED"));

        verify(service).update(owner, "Ana", LocalDate.of(2000, 5, 10), EnglishLevel.B1, null);
    }

    @Test
    void dismissesOnlyTheAuthenticatedUsersOnboarding() throws Exception {
        UUID owner = UUID.randomUUID();
        when(service.dismissOnboarding(owner)).thenReturn(profile(owner, OnboardingStatus.DISMISSED));

        mockMvc.perform(post("/api/v1/users/me/profile/onboarding/dismiss")
                        .header("Authorization", "Bearer " + token(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.onboardingStatus").value("DISMISSED"));

        verify(service).dismissOnboarding(owner);
    }

    private UserProfileEntity profile(UUID userId, OnboardingStatus status) {
        return new UserProfileEntity(userId, "Ana", LocalDate.of(2000, 5, 10), EnglishLevel.B1, null,
                AvatarType.PREDEFINED, "avatar_01", status,
                OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC));
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
