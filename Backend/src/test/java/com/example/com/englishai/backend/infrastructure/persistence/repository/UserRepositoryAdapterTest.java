package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.application.user.exception.UserAlreadyExistsException;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class UserRepositoryAdapterTest {

    private final UserJpaRepository jpaRepository = mock(UserJpaRepository.class);
    private final UserMapper mapper = mock(UserMapper.class);
    private final UserRepositoryAdapter adapter = new UserRepositoryAdapter(jpaRepository, mapper);

    @Test
    void shouldTranslateDatabaseDuplicateFailureToApplicationException() {
        User user = user();
        UserEntity entity = mock(UserEntity.class);
        when(mapper.toEntity(user)).thenReturn(entity);
        when(jpaRepository.save(entity))
                .thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint"));

        assertThatThrownBy(() -> adapter.save(user))
                .isInstanceOf(UserAlreadyExistsException.class)
                .hasMessage("User already exists")
                .hasNoCause();

        verify(jpaRepository).save(entity);
        verifyNoMoreInteractions(jpaRepository);
        verify(mapper).toEntity(user);
        verifyNoMoreInteractions(mapper);
    }

    private User user() {
        OffsetDateTime now = OffsetDateTime.now();
        return new User(UUID.randomUUID(), "user@test.com", "test-user", "hash", now, now);
    }
}
