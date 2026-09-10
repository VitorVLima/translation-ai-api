package com.example.com.englishai.backend.integration.user;

import com.example.com.englishai.backend.application.user.usecase.CreateUser;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class CreateUserIntegrationTest {

    @Autowired
    private CreateUser createUser;

    @Autowired
    private UserJpaRepository userJpaRepository;

    @Test
    @DisplayName("Should create and persist a user")
    void shouldCreateAndPersistUser() {

        String uniqueValue = UUID.randomUUID().toString();
        String email = "integration-" + uniqueValue + "@test.com";
        String username = "user-" + uniqueValue.substring(0, 12);

        User user = createUser.execute(
                email,
                username,
                "hashed-password"
        );

        assertThat(user.getId()).isNotNull();
        assertThat(user.getEmail()).isEqualTo(email);
        assertThat(user.getUsername()).isEqualTo(username);

        var savedUser = userJpaRepository.findById(user.getId());

        assertThat(savedUser).isPresent();
        assertThat(savedUser.get().getEmail())
                .isEqualTo(email);
    }
}
