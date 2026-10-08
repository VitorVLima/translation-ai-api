package com.example.com.englishai.backend.presentation.rest.profile;

import com.example.com.englishai.backend.application.admin.CatalogService;
import com.example.com.englishai.backend.application.profile.*;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserProfileEntity;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users/me/profile")
public class ProfileController {
    private final ProfileService service;
    private final CatalogService catalog;

    public ProfileController(ProfileService service, CatalogService catalog) {
        this.service = service;
        this.catalog = catalog;
    }

    @GetMapping
    public ProfileResponse get(@AuthenticationPrincipal UUID userId) {
        return ProfileResponse.from(service.getOrCreate(userId), service.name(userId));
    }

    @PutMapping
    public ProfileResponse update(@AuthenticationPrincipal UUID userId, @Valid @RequestBody ProfileRequest request) {
        var profile = service.update(userId, request.preferredName(), request.birthDate(),
                request.englishLevel(), request.learningGoal());
        return ProfileResponse.from(profile, service.name(userId));
    }

    @PutMapping("/initial-setup")
    public ProfileResponse completeInitialSetup(@AuthenticationPrincipal UUID userId,
                                                @Valid @RequestBody InitialSetupRequest request) {
        if (!isOnboardingAvatar(request.avatarKey())) {
            throw new InvalidProfileRequestException("Invalid avatar");
        }
        var profile = service.updateInitialSetup(userId, request.name(), request.birthDate(), request.englishLevel(),
                request.learningGoal(), request.avatarKey());
        return ProfileResponse.from(profile, service.name(userId));
    }

    @PostMapping("/initial-setup/skip")
    public ProfileResponse skipInitialSetup(@AuthenticationPrincipal UUID userId) {
        return ProfileResponse.from(service.skipInitialSetup(userId), service.name(userId));
    }

    @PutMapping("/avatar/predefined")
    public ProfileResponse predefined(@AuthenticationPrincipal UUID userId, @Valid @RequestBody PredefinedAvatar request) {
        if (!isUserSelectableAvatar(request.avatarKey())) {
            throw new InvalidProfileRequestException("Invalid avatar");
        }
        return ProfileResponse.from(service.setAvatar(userId, AvatarType.PREDEFINED, request.avatarKey()), service.name(userId));
    }

    @PostMapping("/onboarding/dismiss")
    public ProfileResponse dismissOnboarding(@AuthenticationPrincipal UUID userId) {
        return ProfileResponse.from(service.dismissOnboarding(userId), service.name(userId));
    }

    public record PredefinedAvatar(@jakarta.validation.constraints.NotBlank String avatarKey) {}

    public record ProfileRequest(@Size(max = 100) String preferredName, LocalDate birthDate,
                                 EnglishLevel englishLevel, LearningGoal learningGoal) {}

    public record InitialSetupRequest(@NotBlank @Size(max = 100) String name, @NotNull LocalDate birthDate,
                                      @NotNull EnglishLevel englishLevel, @NotNull LearningGoal learningGoal,
                                      @NotBlank @Size(max = 64) String avatarKey) {}

    private boolean isUserSelectableAvatar(String key) {
        return key != null && key.matches("avatar_(default|0[1-6])")
                && catalog.publicAvatars().stream().anyMatch(avatar -> avatar.getAvatarKey().equals(key));
    }

    private boolean isOnboardingAvatar(String key) {
        return key != null && key.matches("avatar_0[1-6]") && isUserSelectableAvatar(key);
    }

    public record ProfileResponse(String preferredName, LocalDate birthDate, Integer age, EnglishLevel englishLevel,
                                  LearningGoal learningGoal, AvatarType avatarType, String avatarKey,
                                  boolean onboardingCompleted, OnboardingStatus onboardingStatus,
                                  OffsetDateTime createdAt, OffsetDateTime updatedAt,
                                  boolean initialSetupCompleted) {
        static ProfileResponse from(UserProfileEntity profile, String name) {
            return new ProfileResponse(name, profile.getBirthDate(), ageAt(profile.getBirthDate()),
                    profile.getEnglishLevel(), profile.getLearningGoal(), AvatarType.PREDEFINED, profile.getAvatarKey(),
                    profile.getOnboardingStatus() == OnboardingStatus.COMPLETED, profile.getOnboardingStatus(),
                    profile.getCreatedAt(), profile.getUpdatedAt(),
                    profile.isInitialSetupCompleted());
        }

        private static Integer ageAt(LocalDate birthDate) {
            if (birthDate == null) return null;
            var today = LocalDate.now(ZoneOffset.UTC);
            int years = today.getYear() - birthDate.getYear();
            return today.getDayOfYear() < birthDate.getDayOfYear() ? years - 1 : years;
        }
    }
}
