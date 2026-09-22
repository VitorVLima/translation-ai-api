package com.example.com.englishai.backend.application.profile;

import com.example.com.englishai.backend.infrastructure.persistence.entity.UserProfileEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserProfileJpaRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class ProfileServiceTest {
    @Test
    void updatesAndReadsEveryControlledEnglishLevel() {
        var repository = mock(UserProfileJpaRepository.class);
        var service = new ProfileService(repository);
        var userId = UUID.randomUUID();
        var persisted = new AtomicReference<UserProfileEntity>();
        when(repository.findById(userId)).thenAnswer(invocation -> Optional.ofNullable(persisted.get()));
        when(repository.save(any(UserProfileEntity.class))).thenAnswer(invocation -> {
            var profile = invocation.<UserProfileEntity>getArgument(0);
            persisted.set(profile);
            return profile;
        });

        for (EnglishLevel level : EnglishLevel.values()) {
            var saved = service.update(userId, "Learner", LocalDate.of(1996, 2, 3), level, LearningGoal.WORK);
            assertThat(saved.getEnglishLevel()).isEqualTo(level);
        }
        verify(repository, times(EnglishLevel.values().length)).save(any(UserProfileEntity.class));
    }

    @Test
    void missingProfileRemainsCompatibleAndProfileContextHasNoInventedLevel() {
        var repository = mock(UserProfileJpaRepository.class);
        var service = new ProfileService(repository);
        var userId = UUID.randomUUID();
        when(repository.findById(userId)).thenReturn(Optional.empty());

        assertThat(service.get(userId)).isNull();
        assertThat(service.context(userId).level()).isNull();
    }

    @Test
    void startsPendingAndCompletesOnlyAfterBirthDateAndSelectedAvatar() {
        var repository = mock(UserProfileJpaRepository.class);
        var service = new ProfileService(repository);
        var userId = UUID.randomUUID();
        var persisted = new AtomicReference<UserProfileEntity>();
        when(repository.findById(userId)).thenAnswer(invocation -> Optional.ofNullable(persisted.get()));
        when(repository.save(any(UserProfileEntity.class))).thenAnswer(invocation -> {
            var profile = invocation.<UserProfileEntity>getArgument(0);
            persisted.set(profile);
            return profile;
        });

        var partial = service.update(userId, null, LocalDate.of(1996, 2, 3), null, null);
        assertThat(partial.getOnboardingStatus()).isEqualTo(OnboardingStatus.PENDING);

        var completed = service.setAvatar(userId, AvatarType.PREDEFINED, "avatar_01");
        assertThat(completed.getOnboardingStatus()).isEqualTo(OnboardingStatus.COMPLETED);
        assertThat(completed.getEnglishLevel()).isNull();
    }

    @Test
    void validatesBirthDateAndKeepsDismissedProfilesDismissedUntilCompleted() {
        var repository = mock(UserProfileJpaRepository.class);
        var service = new ProfileService(repository);
        var userId = UUID.randomUUID();
        var persisted = new AtomicReference<UserProfileEntity>();
        when(repository.findById(userId)).thenAnswer(invocation -> Optional.ofNullable(persisted.get()));
        when(repository.save(any(UserProfileEntity.class))).thenAnswer(invocation -> {
            var profile = invocation.<UserProfileEntity>getArgument(0);
            persisted.set(profile);
            return profile;
        });

        var dismissed = service.dismissOnboarding(userId);
        assertThat(dismissed.getOnboardingStatus()).isEqualTo(OnboardingStatus.DISMISSED);
        assertThat(service.update(userId, null, LocalDate.of(1996, 2, 3), EnglishLevel.B1, null)
                .getOnboardingStatus()).isEqualTo(OnboardingStatus.DISMISSED);
        assertThat(service.setAvatar(userId, AvatarType.PREDEFINED, "avatar_02")
                .getOnboardingStatus()).isEqualTo(OnboardingStatus.COMPLETED);
        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                service.update(userId, null, LocalDate.now(ZoneOffset.UTC).plusDays(1), null, null))
                .isInstanceOf(InvalidProfileRequestException.class);
    }
}
