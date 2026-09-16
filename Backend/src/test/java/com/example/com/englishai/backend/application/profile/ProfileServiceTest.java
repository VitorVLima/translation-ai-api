package com.example.com.englishai.backend.application.profile;

import com.example.com.englishai.backend.infrastructure.persistence.entity.UserProfileEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserProfileJpaRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class ProfileServiceTest {
    @Test
    void updatesAndReadsEveryControlledEnglishLevel() {
        var repository = mock(UserProfileJpaRepository.class);
        var service = new ProfileService(repository);
        var userId = UUID.randomUUID();
        when(repository.findById(userId)).thenReturn(Optional.empty());
        when(repository.save(any(UserProfileEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        for (EnglishLevel level : EnglishLevel.values()) {
            var saved = service.update(userId, "Learner", 30, level, LearningGoal.WORK);
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
}
