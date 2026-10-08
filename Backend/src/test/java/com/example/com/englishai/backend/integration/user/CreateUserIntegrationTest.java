package com.example.com.englishai.backend.integration.user;

import com.example.com.englishai.backend.application.user.usecase.CreateUser;
import com.example.com.englishai.backend.application.profile.ProfileService;
import com.example.com.englishai.backend.application.profile.EnglishLevel;
import com.example.com.englishai.backend.application.profile.LearningGoal;
import com.example.com.englishai.backend.application.user.exception.EmailAlreadyExistsException;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Transactional
class CreateUserIntegrationTest {

    @Autowired
    private CreateUser createUser;

    @Autowired
    private UserJpaRepository userJpaRepository;

    @Autowired
    private ProfileService profileService;

    @Test
    @DisplayName("Should create and persist a user")
    void shouldCreateAndPersistUser() {

        String uniqueValue = UUID.randomUUID().toString();
        String email = "integration-" + uniqueValue + "@test.com";

        User user = createUser.execute(
                email,
                "hashed-password"
        );

        assertThat(user.getId()).isNotNull();
        assertThat(user.getEmail()).isEqualTo(email);
        assertThat(user.getUsername()).isNull();
        assertThat(user.isEmailVerified()).isFalse();

        var savedUser = userJpaRepository.findById(user.getId());

        assertThat(savedUser).isPresent();
        assertThat(savedUser.get().getEmail())
                .isEqualTo(email);
    }

    @Test
    @DisplayName("Should reject a case-insensitive duplicate e-mail at the application boundary")
    void shouldRejectCaseInsensitiveDuplicateEmail() {
        String uniqueValue = UUID.randomUUID().toString();
        String normalizedEmail = "google-" + uniqueValue + "@test.com";
        userJpaRepository.saveAndFlush(new UserEntity(UUID.randomUUID(), normalizedEmail, "google-" + uniqueValue.substring(0, 8),
                null, OffsetDateTime.now(), OffsetDateTime.now(), true));

        assertThatThrownBy(() -> createUser.execute(normalizedEmail.toUpperCase(), "hash"))
                .isInstanceOf(EmailAlreadyExistsException.class);
    }

    @Test
    @DisplayName("Setup stores human names in username and allows the same name on different accounts")
    void setupAllowsDuplicateHumanNames() {
        String firstEmail = "first-" + UUID.randomUUID() + "@test.com";
        String secondEmail = "second-" + UUID.randomUUID() + "@test.com";
        User first = createUser.execute(firstEmail, "hash");
        User second = createUser.execute(secondEmail, "hash");

        profileService.updateInitialSetup(first.getId(), "  João Silva  ", java.time.LocalDate.of(2000, 1, 1),
                EnglishLevel.B1, LearningGoal.WORK, "avatar_01");
        profileService.updateInitialSetup(second.getId(), "João Silva", java.time.LocalDate.of(2001, 1, 1),
                EnglishLevel.A1, LearningGoal.STUDY, "avatar_01");

        assertThat(userJpaRepository.findById(first.getId()).orElseThrow().getUsername()).isEqualTo("João Silva");
        assertThat(userJpaRepository.findById(second.getId()).orElseThrow().getUsername()).isEqualTo("João Silva");
    }
}
