package com.example.com.englishai.backend.application.catalog;

import com.example.com.englishai.backend.infrastructure.persistence.entity.PredefinedAvatarEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.PredefinedAvatarJpaRepository;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class AssistantIdentityResolverTest {
    @Test
    void resolvesDisplayNameAndImageFromAvatarKey() {
        var repository = mock(PredefinedAvatarJpaRepository.class);
        var avatar = new PredefinedAvatarEntity(UUID.randomUUID(), "interviewer_default", "Rodrigo", "rodrigo", true, 1, OffsetDateTime.now());
        when(repository.findByAvatarKey("interviewer_default")).thenReturn(Optional.of(avatar));

        var identity = new AssistantIdentityResolver(repository).resolve("interviewer_default");

        assertThat(identity.displayName()).isEqualTo("Rodrigo");
        assertThat(identity.avatarKey()).isEqualTo("interviewer_default");
        assertThat(identity.imageUrl()).isEqualTo("/api/v1/avatars/interviewer_default/image");
    }

    @Test
    void missingAvatarIsRejectedWithoutGenericName() {
        var repository = mock(PredefinedAvatarJpaRepository.class);
        when(repository.findByAvatarKey("waiter_default")).thenReturn(Optional.empty());

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> new AssistantIdentityResolver(repository).resolve("waiter_default"))
                .isInstanceOf(java.util.NoSuchElementException.class);
    }
}
