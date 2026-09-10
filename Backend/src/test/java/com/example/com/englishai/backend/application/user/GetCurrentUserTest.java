package com.example.com.englishai.backend.application.user;

import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.application.user.exception.CurrentUserNotFoundException;
import com.example.com.englishai.backend.application.user.usecase.GetCurrentUser;
import com.example.com.englishai.backend.domain.user.User;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class GetCurrentUserTest {

    private final UserRepository repository = mock(UserRepository.class);
    private final GetCurrentUser getCurrentUser = new GetCurrentUser(repository);

    @Test
    void shouldReturnUserFoundByAuthenticatedId() {
        UUID userId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        User user = new User(userId, "user@test.com", "test-user", "stored-hash", now, now);
        when(repository.findById(userId)).thenReturn(Optional.of(user));

        assertThat(getCurrentUser.execute(userId)).isSameAs(user);

        verify(repository).findById(userId);
        verifyNoMoreInteractions(repository);
    }

    @Test
    void shouldRejectUserThatNoLongerExists() {
        UUID userId = UUID.randomUUID();
        when(repository.findById(userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> getCurrentUser.execute(userId))
                .isInstanceOf(CurrentUserNotFoundException.class);

        verify(repository).findById(userId);
        verifyNoMoreInteractions(repository);
    }
}
