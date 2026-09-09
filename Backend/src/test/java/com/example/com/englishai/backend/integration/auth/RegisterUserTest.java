package com.example.com.englishai.backend.integration.auth;

import com.example.com.englishai.backend.application.authentication.RegisterUser;
import com.example.com.englishai.backend.application.ports.PasswordEncoder;
import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.application.user.usecase.CreateUser;
import com.example.com.englishai.backend.domain.user.User;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RegisterUserTest {

    private final UserRepository userRepository =
            mock(UserRepository.class);

    private final PasswordEncoder passwordEncoder =
            mock(PasswordEncoder.class);

    private final CreateUser createUser =
            new CreateUser(userRepository);

    private final RegisterUser registerUser =
            new RegisterUser(createUser, passwordEncoder);

    @Test
    void shouldEncodePasswordBeforeCreatingUser() {

        String email = "vitor@test.com";
        String username = "vitor";
        String rawPassword = "123456";
        String passwordHash = "hashed-password";

        when(passwordEncoder.encode(rawPassword))
                .thenReturn(passwordHash);

        User user = new User(
                UUID.randomUUID(),
                email,
                username,
                passwordHash,
                OffsetDateTime.now(),
                OffsetDateTime.now()
        );

        when(userRepository.save(any(User.class)))
                .thenReturn(user);

        User result = registerUser.execute(
                email,
                username,
                rawPassword
        );

        assertThat(result.getPasswordHash())
                .isEqualTo(passwordHash);

        verify(passwordEncoder)
                .encode(rawPassword);

        verify(userRepository)
                .save(any(User.class));
    }
}