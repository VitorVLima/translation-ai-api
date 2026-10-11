package com.example.com.englishai.backend.presentation.rest.profile;

import com.example.com.englishai.backend.application.admin.CatalogService;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.application.ports.RefreshTokenFamilyRepository;
import com.example.com.englishai.backend.domain.authentication.RefreshTokenFamily;
import com.example.com.englishai.backend.application.profile.AvatarType;
import com.example.com.englishai.backend.application.profile.EnglishLevel;
import com.example.com.englishai.backend.application.profile.OnboardingStatus;
import com.example.com.englishai.backend.application.profile.ProfileService;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserProfileEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.PredefinedAvatarEntity;
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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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
    private static final UUID FAMILY_ID = UUID.randomUUID();

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProfileService service;
    @MockitoBean
    private CatalogService catalog;
    @MockitoBean private RefreshTokenFamilyRepository families;

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
    void initialSetupIsSavedForTheAuthenticatedPrincipalAndReturnsCompletion() throws Exception {
        UUID owner = UUID.randomUUID();
        var updated = profile(owner, OnboardingStatus.PENDING);
        var avatar = mock(PredefinedAvatarEntity.class);
        when(avatar.getAvatarKey()).thenReturn("avatar_01");
        when(catalog.publicAvatars()).thenReturn(List.of(avatar));
        updated.updateInitialSetup(LocalDate.of(2000, 5, 10), EnglishLevel.B1,
                com.example.com.englishai.backend.application.profile.LearningGoal.TRAVEL,
                OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC));
        when(service.updateInitialSetup(owner, "Ana Silva", LocalDate.of(2000, 5, 10), EnglishLevel.B1,
                com.example.com.englishai.backend.application.profile.LearningGoal.TRAVEL, "avatar_01")).thenReturn(updated);

        mockMvc.perform(put("/api/v1/users/me/profile/initial-setup").header("Authorization", "Bearer " + token(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ana Silva\",\"birthDate\":\"2000-05-10\",\"englishLevel\":\"B1\",\"learningGoal\":\"TRAVEL\",\"avatarKey\":\"avatar_01\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preferredLanguage").doesNotExist())
                .andExpect(jsonPath("$.initialSetupCompleted").value(true));

        verify(service).updateInitialSetup(owner, "Ana Silva", LocalDate.of(2000, 5, 10), EnglishLevel.B1,
                com.example.com.englishai.backend.application.profile.LearningGoal.TRAVEL, "avatar_01");
    }

    @Test
    void initialSetupRejectsMissingFieldsBeforeCallingService() throws Exception {
        UUID owner = UUID.randomUUID();
        mockMvc.perform(put("/api/v1/users/me/profile/initial-setup").header("Authorization", "Bearer " + token(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"birthDate\":\"2000-05-10\",\"englishLevel\":\"A1\",\"learningGoal\":\"GENERAL\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put("/api/v1/users/me/profile/initial-setup").header("Authorization", "Bearer " + token(owner))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"englishLevel\":\"A1\",\"learningGoal\":\"GENERAL\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put("/api/v1/users/me/profile/initial-setup").header("Authorization", "Bearer " + token(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"birthDate\":\"2000-05-10\",\"englishLevel\":\"A1\"}"))
                .andExpect(status().isBadRequest());
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

    @Test
    void skippingInitialSetupMarksOnlyTheAuthenticatedProfileCompleteWithoutProfileValues() throws Exception {
        UUID owner = UUID.randomUUID();
        var skipped = new UserProfileEntity(owner, null, null, null, null, AvatarType.PREDEFINED, "avatar_default",
                OnboardingStatus.PENDING, OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC));
        skipped.markInitialSetupSkipped(OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC));
        when(service.skipInitialSetup(owner)).thenReturn(skipped);

        mockMvc.perform(post("/api/v1/users/me/profile/initial-setup/skip")
                        .header("Authorization", "Bearer " + token(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.initialSetupCompleted").value(true))
                .andExpect(jsonPath("$.birthDate").value(org.hamcrest.Matchers.nullValue()));

        verify(service).skipInitialSetup(owner);
    }

    @Test
    void rejectsDefaultOrUnknownAvatarBeforeCompletingSetup() throws Exception {
        UUID owner = UUID.randomUUID();
        var defaultAvatar = mock(PredefinedAvatarEntity.class);
        when(defaultAvatar.getAvatarKey()).thenReturn("avatar_default");
        when(catalog.publicAvatars()).thenReturn(List.of(defaultAvatar));

        mockMvc.perform(put("/api/v1/users/me/profile/initial-setup")
                        .header("Authorization", "Bearer " + token(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ana\",\"birthDate\":\"2000-05-10\",\"englishLevel\":\"B1\",\"learningGoal\":\"TRAVEL\",\"avatarKey\":\"avatar_default\"}"))
                .andExpect(status().isBadRequest());

        verify(service, never()).updateInitialSetup(eq(owner), eq("Ana"), eq(LocalDate.of(2000, 5, 10)),
                eq(EnglishLevel.B1), eq(com.example.com.englishai.backend.application.profile.LearningGoal.TRAVEL), eq("avatar_default"));
    }

    private UserProfileEntity profile(UUID userId, OnboardingStatus status) {
        return new UserProfileEntity(userId, "Ana", LocalDate.of(2000, 5, 10), EnglishLevel.B1, null,
                AvatarType.PREDEFINED, "avatar_01", status,
                OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC));
    }

    private String token(UUID userId) {
        when(families.findById(FAMILY_ID)).thenReturn(Optional.of(new RefreshTokenFamily(FAMILY_ID,
                userId, OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC),
                OffsetDateTime.ofInstant(CLOCK.instant().plusSeconds(3600), ZoneOffset.UTC), null)));
        return new JwtTokenGenerator(SECRET, Duration.ofMinutes(15), CLOCK).generate(userId, FAMILY_ID);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TokenConfiguration {
        @Bean
        AuthenticationTokenValidator tokenValidator(RefreshTokenFamilyRepository families) {
            return new JwtTokenValidator(SECRET, CLOCK, families);
        }
    }

    private static String randomSecret() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return Base64.getEncoder().encodeToString(key);
    }
}
