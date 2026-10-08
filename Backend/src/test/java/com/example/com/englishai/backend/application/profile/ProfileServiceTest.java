package com.example.com.englishai.backend.application.profile;

import com.example.com.englishai.backend.infrastructure.persistence.entity.UserProfileEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserProfileJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProfileServiceTest {
    private ProfileService service(UserProfileJpaRepository profiles) {
        var users = mock(UserJpaRepository.class);
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        when(users.findById(any())).thenAnswer(invocation -> Optional.of(new UserEntity(
                invocation.getArgument(0), "user@test.com", null, "hash", now, now)));
        return new ProfileService(profiles, users);
    }

    @Test
    void setupTrimsNamesAndAllowsTwoAccountsWithTheSameName() {
        var profiles = mock(UserProfileJpaRepository.class);
        var users = mock(UserJpaRepository.class);
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        var first = new UserEntity(UUID.randomUUID(), "first@test.com", null, "hash", now, now);
        var second = new UserEntity(UUID.randomUUID(), "second@test.com", null, "hash", now, now);
        when(users.findById(first.getId())).thenReturn(Optional.of(first));
        when(users.findById(second.getId())).thenReturn(Optional.of(second));
        when(profiles.save(any(UserProfileEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var service = new ProfileService(profiles, users);

        service.updateInitialSetup(first.getId(), "  João Silva  ", LocalDate.of(2000, 1, 1), EnglishLevel.B1, LearningGoal.WORK, "avatar_01");
        service.updateInitialSetup(second.getId(), "João Silva", LocalDate.of(2001, 1, 1), EnglishLevel.A1, LearningGoal.STUDY, "avatar_01");

        assertThat(first.getUsername()).isEqualTo("João Silva");
        assertThat(second.getUsername()).isEqualTo("João Silva");
        verify(users, times(2)).save(any(UserEntity.class));
        verify(users, never()).existsByUsername(any());
    }

    @Test
    void setupRejectsBlankAndOversizedNamesBeforeCompletion() {
        var profiles = mock(UserProfileJpaRepository.class);
        var users = mock(UserJpaRepository.class);
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        var userId = UUID.randomUUID();
        when(users.findById(userId)).thenReturn(Optional.of(new UserEntity(userId, "user@test.com", null, "hash", now, now)));
        var service = new ProfileService(profiles, users);
        for (String invalid : new String[] {"  ", "a".repeat(101)}) {
            assertThatThrownBy(() -> service.updateInitialSetup(userId, invalid, LocalDate.of(2000, 1, 1), EnglishLevel.A1, LearningGoal.GENERAL, "avatar_01"))
                    .isInstanceOf(InvalidProfileRequestException.class);
        }
        verify(profiles, never()).save(any());
        verify(users, never()).save(any());
    }

    @Test
    void updatesAndReadsEveryControlledEnglishLevel() {
        var repository = mock(UserProfileJpaRepository.class);
        var service = service(repository);
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
    void initialSetupPersistsBirthDateLevelGoalAndCompletionForTheAuthenticatedAccount() {
        var repository = mock(UserProfileJpaRepository.class);
        var service = service(repository);
        var userId = UUID.randomUUID();
        when(repository.findById(userId)).thenReturn(Optional.empty());
        when(repository.save(any(UserProfileEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var profile = service.updateInitialSetup(userId, "  Ana Silva  ", LocalDate.of(1996, 2, 3), EnglishLevel.B1,
                LearningGoal.TRAVEL, "avatar_01");

        assertThat(profile.getBirthDate()).isEqualTo(LocalDate.of(1996, 2, 3));
        assertThat(profile.getEnglishLevel()).isEqualTo(EnglishLevel.B1);
        assertThat(profile.getLearningGoal()).isEqualTo(LearningGoal.TRAVEL);
        assertThat(profile.getAvatarKey()).isEqualTo("avatar_01");
        assertThat(profile.isInitialSetupCompleted()).isTrue();
        verify(repository).save(profile);
    }

    @Test
    void initialSetupRejectsFutureBirthDateAndMissingRequiredFieldsWithoutCompleting() {
        var repository = mock(UserProfileJpaRepository.class);
        var service = service(repository);
        var userId = UUID.randomUUID();
        assertThatThrownBy(() -> service.updateInitialSetup(userId, "Ana", LocalDate.now(ZoneOffset.UTC).plusDays(1),
                EnglishLevel.A1, LearningGoal.GENERAL, "avatar_01"))
                .isInstanceOf(InvalidProfileRequestException.class);
        assertThatThrownBy(() -> service.updateInitialSetup(userId, "Ana", LocalDate.of(2000, 1, 1),
                null, LearningGoal.GENERAL, "avatar_01"))
                .isInstanceOf(InvalidProfileRequestException.class);
        assertThatThrownBy(() -> service.updateInitialSetup(userId, "Ana", LocalDate.of(2000, 1, 1),
                EnglishLevel.A1, null, "avatar_01"))
                .isInstanceOf(InvalidProfileRequestException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void existingCompletedSetupStaysCompletedDuringOrdinaryProfileEdit() {
        var repository = mock(UserProfileJpaRepository.class);
        var service = service(repository);
        var userId = UUID.randomUUID();
        var completed = new UserProfileEntity(userId, null, LocalDate.of(2000, 1, 1), EnglishLevel.B1,
                LearningGoal.WORK, AvatarType.PREDEFINED, "avatar_default", OnboardingStatus.PENDING,
                OffsetDateTime.now(ZoneOffset.UTC));
        completed.updateInitialSetup(LocalDate.of(2000, 1, 1), EnglishLevel.B1, LearningGoal.WORK, OffsetDateTime.now(ZoneOffset.UTC));
        when(repository.findById(userId)).thenReturn(Optional.of(completed));
        when(repository.save(any(UserProfileEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service.update(userId, null, LocalDate.of(2000, 1, 1), EnglishLevel.B2, LearningGoal.WORK)
                .isInitialSetupCompleted()).isTrue();
    }

    @Test
    void missingProfileRemainsCompatibleAndProfileContextHasNoInventedLevel() {
        var repository = mock(UserProfileJpaRepository.class);
        var service = service(repository);
        var userId = UUID.randomUUID();
        when(repository.findById(userId)).thenReturn(Optional.empty());

        assertThat(service.get(userId)).isNull();
        assertThat(service.context(userId).level()).isNull();
    }

    @Test
    void startsPendingAndCompletesOnlyAfterBirthDateAndSelectedAvatar() {
        var repository = mock(UserProfileJpaRepository.class);
        var service = service(repository);
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
        var service = service(repository);
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

    @Test
    void skippingCompletesInitialSetupWithoutInventingProfileValues() {
        var repository = mock(UserProfileJpaRepository.class);
        var service = service(repository);
        var userId = UUID.randomUUID();
        when(repository.findById(userId)).thenReturn(Optional.empty());
        when(repository.save(any(UserProfileEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var skipped = service.skipInitialSetup(userId);

        assertThat(skipped.isInitialSetupCompleted()).isTrue();
        assertThat(skipped.getBirthDate()).isNull();
        assertThat(skipped.getEnglishLevel()).isNull();
        assertThat(skipped.getLearningGoal()).isNull();
        assertThat(skipped.getAvatarKey()).isEqualTo("avatar_default");
        verify(repository).save(skipped);
    }
}
