package com.example.com.englishai.backend.application.profile;

import com.example.com.englishai.backend.infrastructure.persistence.entity.UserProfileEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserProfileJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Service
public class ProfileService {
    private static final String DEFAULT_AVATAR_KEY = "avatar_default";

    private final UserProfileJpaRepository repo;
    private final UserJpaRepository users;

    public ProfileService(UserProfileJpaRepository repo, UserJpaRepository users) {
        this.repo = repo;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public String name(UUID userId) {
        return users.findById(userId).map(user -> user.getUsername()).orElse(null);
    }

    @Transactional(readOnly = true)
    public UserProfileEntity get(UUID userId) {
        return repo.findById(userId).orElse(null);
    }

    /** Creates the persisted PENDING profile lazily when an authenticated client first reads it. */
    @Transactional
    public UserProfileEntity getOrCreate(UUID userId) {
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        return repo.findById(userId).orElseGet(() -> repo.save(newProfile(userId, now)));
    }

    public UserLearningContext context(UUID userId) {
        var profile = get(userId);
        return profile == null
                ? new UserLearningContext(null, null, null, null)
                : new UserLearningContext(name(userId), ageAt(profile.getBirthDate()),
                profile.getEnglishLevel(), profile.getLearningGoal());
    }

    @Transactional
    public UserProfileEntity update(UUID userId, String name, LocalDate birthDate,
                                    EnglishLevel level, LearningGoal goal) {
        validateBirthDate(birthDate);
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        if (name != null) saveName(userId, name, now);
        var profile = repo.findById(userId).orElseGet(() -> newProfile(userId, now));
        profile.update(profile.getPreferredName(), birthDate, level, goal, now);
        applyDerivedOnboardingStatus(profile, now);
        return repo.save(profile);
    }

    @Transactional
    public UserProfileEntity updateInitialSetup(UUID userId, String name, LocalDate birthDate, EnglishLevel level,
                                                LearningGoal goal, String avatarKey) {
        if (birthDate == null || level == null || goal == null || avatarKey == null || avatarKey.isBlank()) {
            throw new InvalidProfileRequestException("Initial profile setup is incomplete");
        }
        validateBirthDate(birthDate);
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        saveName(userId, name, now);
        var profile = repo.findById(userId).orElseGet(() -> newProfile(userId, now));
        profile.updateInitialSetup(birthDate, level, goal, now);
        profile.setAvatar(AvatarType.PREDEFINED, avatarKey, now);
        return repo.save(profile);
    }

    @Transactional
    public UserProfileEntity skipInitialSetup(UUID userId) {
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        var profile = repo.findById(userId).orElseGet(() -> newProfile(userId, now));
        profile.markInitialSetupSkipped(now);
        return repo.save(profile);
    }

    private void saveName(UUID userId, String name, OffsetDateTime now) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty() || trimmed.length() > 100) {
            throw new InvalidProfileRequestException("Name must be between 1 and 100 characters");
        }
        var user = users.findById(userId)
                .orElseThrow(() -> new InvalidProfileRequestException("User not found"));
        user.setUsername(trimmed, now);
        users.save(user);
    }

    @Transactional
    public UserProfileEntity setAvatar(UUID userId, AvatarType type, String key) {
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        var profile = repo.findById(userId).orElseGet(() -> newProfile(userId, now));
        profile.setAvatar(AvatarType.PREDEFINED, key, now);
        applyDerivedOnboardingStatus(profile, now);
        return repo.save(profile);
    }

    @Transactional
    public UserProfileEntity dismissOnboarding(UUID userId) {
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        var profile = repo.findById(userId).orElseGet(() -> newProfile(userId, now));
        if (profile.getOnboardingStatus() == OnboardingStatus.PENDING) {
            profile.setOnboardingStatus(OnboardingStatus.DISMISSED, now);
        }
        return repo.save(profile);
    }

    private UserProfileEntity newProfile(UUID userId, OffsetDateTime now) {
        return new UserProfileEntity(userId, null, null, null, null,
                AvatarType.PREDEFINED, DEFAULT_AVATAR_KEY, OnboardingStatus.PENDING, now);
    }

    private void applyDerivedOnboardingStatus(UserProfileEntity profile, OffsetDateTime now) {
        if (isComplete(profile)) {
            profile.setOnboardingStatus(OnboardingStatus.COMPLETED, now);
        }
    }

    /* English level is optional because “Não sei meu nível” is valid in this first version. */
    private boolean isComplete(UserProfileEntity profile) {
        return profile.getBirthDate() != null
                && profile.getAvatarKey() != null
                && !profile.getAvatarKey().isBlank()
                && !DEFAULT_AVATAR_KEY.equals(profile.getAvatarKey());
    }

    private void validateBirthDate(LocalDate birthDate) {
        if (birthDate != null && birthDate.isAfter(LocalDate.now(ZoneOffset.UTC))) {
            throw new InvalidProfileRequestException("Birth date cannot be in the future");
        }
    }

    private Integer ageAt(LocalDate birthDate) {
        if (birthDate == null) {
            return null;
        }
        var today = LocalDate.now(ZoneOffset.UTC);
        int years = today.getYear() - birthDate.getYear();
        return today.getDayOfYear() < birthDate.getDayOfYear() ? years - 1 : years;
    }
}
