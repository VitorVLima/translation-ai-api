package com.example.com.englishai.backend.application.catalog;

import com.example.com.englishai.backend.infrastructure.persistence.entity.PredefinedAvatarEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.PredefinedAvatarJpaRepository;
import org.springframework.stereotype.Service;

import java.util.NoSuchElementException;

/** Resolves the presentation identity from the avatar catalog key. */
@Service
public class AssistantIdentityResolver {
    private final PredefinedAvatarJpaRepository avatars;

    public AssistantIdentityResolver(PredefinedAvatarJpaRepository avatars) {
        this.avatars = avatars;
    }

    public AssistantIdentity resolve(String avatarKey) {
        if (avatarKey == null || avatarKey.isBlank()) {
            throw new IllegalArgumentException("Assistant avatar key is required");
        }
        PredefinedAvatarEntity avatar = avatars.findByAvatarKey(avatarKey)
                .orElseThrow(() -> new NoSuchElementException("Assistant avatar not found"));
        if (avatar.getDisplayName() == null || avatar.getDisplayName().isBlank()) {
            throw new IllegalStateException("Assistant avatar has no display name");
        }
        return new AssistantIdentity(avatar.getDisplayName(), avatar.getAvatarKey(),
                "/api/v1/avatars/" + avatar.getAvatarKey() + "/image");
    }

    public record AssistantIdentity(String displayName, String avatarKey, String imageUrl) {}
}
