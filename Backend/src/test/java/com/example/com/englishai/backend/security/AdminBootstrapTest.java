package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.domain.user.UserRole;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import com.example.com.englishai.backend.infrastructure.security.AdminBootstrap;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AdminBootstrapTest {
    private final UserJpaRepository users = mock(UserJpaRepository.class);

    @Test void emptyConfigurationDoesNothing() {
        new AdminBootstrap(users, "", "").promoteConfiguredUser();
        verifyNoInteractions(users);
    }

    @Test void missingConfiguredUserIsNotCreated() {
        when(users.findAllByNormalizedEmail("missing@example.com")).thenReturn(List.of());
        new AdminBootstrap(users, "", "missing@example.com").promoteConfiguredUser();
        verify(users, never()).save(any());
    }

    @Test void existingUserIsPromotedWhenNoSuperAdminExists() {
        UserEntity user = user(UserRole.USER);
        when(users.findAllByNormalizedEmail("user@example.com")).thenReturn(List.of(user));
        when(users.countByRole(UserRole.SUPER_ADMIN)).thenReturn(0L);
        new AdminBootstrap(users, "", "user@example.com").promoteConfiguredUser();
        assertThat(user.getRole()).isEqualTo(UserRole.SUPER_ADMIN);
        verify(users).save(user);
    }

    @Test void conflictDoesNotTransferExistingSuperAdmin() {
        UserEntity candidate = user(UserRole.ADMIN);
        when(users.findAllByNormalizedEmail("candidate@example.com")).thenReturn(List.of(candidate));
        when(users.countByRole(UserRole.SUPER_ADMIN)).thenReturn(1L);
        new AdminBootstrap(users, "", "candidate@example.com").promoteConfiguredUser();
        assertThat(candidate.getRole()).isEqualTo(UserRole.ADMIN);
        verify(users, never()).save(candidate);
    }

    @Test void sameEmailInLegacyAndSuperBootstrapKeepsSuperAdmin() {
        UserEntity user = user(UserRole.USER);
        when(users.findAllByNormalizedEmail("same@example.com")).thenReturn(List.of(user));
        when(users.countByRole(UserRole.SUPER_ADMIN)).thenReturn(0L);
        new AdminBootstrap(users, "same@example.com", "same@example.com").promoteConfiguredUser();
        assertThat(user.getRole()).isEqualTo(UserRole.SUPER_ADMIN);
    }

    @Test void ambiguousLegacyEmailIsNeverPromoted() {
        when(users.findAllByNormalizedEmail("duplicate@example.com"))
                .thenReturn(List.of(user(UserRole.USER), user(UserRole.USER)));

        new AdminBootstrap(users, "", "duplicate@example.com").promoteConfiguredUser();

        verify(users, never()).save(any());
    }

    private static UserEntity user(UserRole role) {
        UserEntity user = new UserEntity(UUID.randomUUID(), "candidate@example.com", "candidate", "hash",
                OffsetDateTime.now(), OffsetDateTime.now(), true);
        user.setRole(role);
        return user;
    }
}
