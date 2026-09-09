package com.example.com.englishai.backend.integration.user;

import com.example.com.englishai.backend.application.user.usecase.CreateUser;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class CreateUserIntegrationTest {

    @Autowired
    private CreateUser createUser;

    @Autowired
    private UserJpaRepository userJpaRepository;

    @Test
    @DisplayName("Should create and persist a user")
    void shouldCreateAndPersistUser() {

        User user = createUser.execute(
                "vitor@test.com",
                "vitor",
                "hashed-password"
        );

        assertThat(user.getId()).isNotNull();
        assertThat(user.getEmail()).isEqualTo("vitor@test.com");
        assertThat(user.getUsername()).isEqualTo("vitor");

        var savedUser = userJpaRepository.findById(user.getId());

        assertThat(savedUser).isPresent();
        assertThat(savedUser.get().getEmail())
                .isEqualTo("vitor@test.com");
    }
}
