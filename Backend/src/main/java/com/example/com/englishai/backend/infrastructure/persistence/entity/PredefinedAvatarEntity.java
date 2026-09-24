package com.example.com.englishai.backend.infrastructure.persistence.entity;

import com.example.com.englishai.backend.application.catalog.AvatarAssetSource;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "predefined_avatars")
public class PredefinedAvatarEntity {
    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 64)
    private String avatarKey;

    @Column(nullable = false, length = 100)
    private String displayName;

    @Column(nullable = false, length = 128)
    private String assetKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AvatarAssetSource assetSource;

    @Column(nullable = false)
    private boolean enabled;

    @Column(nullable = false)
    private int sortOrder;

    @Column(nullable = false)
    private OffsetDateTime createdAt;

    @Column(nullable = false)
    private OffsetDateTime updatedAt;

    protected PredefinedAvatarEntity() {
    }

    public PredefinedAvatarEntity(
            UUID id,
            String key,
            String name,
            String asset,
            boolean enabled,
            int order,
            OffsetDateTime now
    ) {
        this(id, key, name, asset, AvatarAssetSource.RUNTIME, enabled, order, now);
    }

    public PredefinedAvatarEntity(
            UUID id,
            String key,
            String name,
            String asset,
            AvatarAssetSource source,
            boolean enabled,
            int order,
            OffsetDateTime now
    ) {
        this.id = id;
        avatarKey = key;
        displayName = name;
        assetKey = asset;
        assetSource = source;
        this.enabled = enabled;
        sortOrder = order;
        createdAt = now;
        updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public String getAvatarKey() {
        return avatarKey;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getAssetKey() {
        return assetKey;
    }

    public AvatarAssetSource getAssetSource() {
        return assetSource;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void update(String n, String a, boolean e, int o, OffsetDateTime t) {
        update(n, a, assetSource, e, o, t);
    }

    public void update(String n, String a, AvatarAssetSource source, boolean e, int o, OffsetDateTime t) {
        displayName = n;
        assetKey = a;
        assetSource = source;
        enabled = e;
        sortOrder = o;
        updatedAt = t;
    }

    public void disable(OffsetDateTime t) {
        enabled = false;
        updatedAt = t;
    }
}
