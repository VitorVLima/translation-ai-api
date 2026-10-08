package com.example.com.englishai.backend.application.user.usecase;

import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.application.user.exception.EmailAlreadyExistsException;
import com.example.com.englishai.backend.domain.user.User;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.mock;

class CreateUserTest {
    private final UserRepository users = mock(UserRepository.class);
    private final CreateUser createUser = new CreateUser(users);

    @Test
    void normalizesEmailBeforeCheckingAndPersistingANewLocalAccount() {
        when(users.existsByEmail("teste@email.com")).thenReturn(false);
        when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        User user = createUser.execute("  Teste@Email.com  ", "hash");

        assertThat(user.getEmail()).isEqualTo("teste@email.com");
        assertThat(user.getUsername()).isNull();
        verify(users).existsByEmail("teste@email.com");
        verify(users).save(any(User.class));
    }

    @Test
    void rejectsLocalRegistrationWhenTheNormalizedEmailAlreadyBelongsToGoogle() {
        when(users.existsByEmail("google@email.com")).thenReturn(true);

        assertThatThrownBy(() -> createUser.execute("Google@Email.com", "hash"))
                .isInstanceOf(EmailAlreadyExistsException.class);

        verify(users).existsByEmail(eq("google@email.com"));
        verify(users, never()).save(any());
    }

    @Test
    void rejectsASecondLocalRegistrationThatDiffersOnlyByEmailCapitalization() {
        when(users.existsByEmail("teste@email.com")).thenReturn(true);

        assertThatThrownBy(() -> createUser.execute("Teste@Email.com", "hash"))
                .isInstanceOf(EmailAlreadyExistsException.class);

        verify(users).existsByEmail("teste@email.com");
        verify(users, never()).save(any());
    }
}
