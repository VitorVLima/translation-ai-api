package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.authentication.exception.InvalidCredentialsException;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenGenerator;
import com.example.com.englishai.backend.application.ports.PasswordEncoder;
import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.domain.user.User;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class LoginUserTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final AuthenticationTokenGenerator tokenGenerator = mock(AuthenticationTokenGenerator.class);
    private final LoginUser loginUser = new LoginUser(userRepository, passwordEncoder, tokenGenerator);

    @Test
    void shouldReturnUserAndGenerateTokenOnlyAfterCheckingPassword() {
        User user = createUser();
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("correct-password", user.getPasswordHash())).thenReturn(true);
        when(tokenGenerator.generate(user.getId())).thenReturn("test-access-token");

        LoginResult result = loginUser.execute(user.getEmail(), "correct-password");

        assertThat(result.user()).isSameAs(user);
        assertThat(result.accessToken()).isEqualTo("test-access-token");
        var order = inOrder(userRepository, passwordEncoder, tokenGenerator);
        order.verify(userRepository).findByEmail(user.getEmail());
        order.verify(passwordEncoder).matches("correct-password", user.getPasswordHash());
        order.verify(tokenGenerator).generate(user.getId());
        verifyNoMoreInteractions(userRepository, passwordEncoder, tokenGenerator);
    }

    @Test
    void shouldRejectUnknownEmail() {
        when(userRepository.findByEmail("unknown@test.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> loginUser.execute("unknown@test.com", "some-password"))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Invalid credentials");

        verify(userRepository).findByEmail("unknown@test.com");
        verifyNoMoreInteractions(userRepository);
        verifyNoInteractions(passwordEncoder, tokenGenerator);
    }

    @Test
    void shouldRejectIncorrectPassword() {
        User user = createUser();
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrong-password", user.getPasswordHash())).thenReturn(false);

        assertThatThrownBy(() -> loginUser.execute(user.getEmail(), "wrong-password"))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Invalid credentials");

        verify(userRepository).findByEmail(user.getEmail());
        verify(passwordEncoder).matches("wrong-password", user.getPasswordHash());
        verifyNoMoreInteractions(userRepository, passwordEncoder);
        verifyNoInteractions(tokenGenerator);
    }

    private User createUser() {
        OffsetDateTime now = OffsetDateTime.now();
        return new User(
                UUID.randomUUID(),
                "user@test.com",
                "test-user",
                "stored-password-hash",
                now,
                now
        );
    }
}
