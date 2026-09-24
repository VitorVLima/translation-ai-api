package com.example.com.englishai.backend.infrastructure.profile;

import com.example.com.englishai.backend.application.catalog.AvatarAssetSource;
import com.example.com.englishai.backend.application.catalog.AvatarImageStorage;
import com.example.com.englishai.backend.application.profile.ProfileImageStorage;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.NoSuchElementException;

@Component
public class CatalogAvatarImageStorage implements AvatarImageStorage {
    private static final String OFFICIAL_ASSET_LOCATION = "classpath:/avatars/official/";

    private final ProfileImageStorage runtimeStorage;
    private final ResourceLoader resources;

    public CatalogAvatarImageStorage(ProfileImageStorage runtimeStorage, ResourceLoader resources) {
        this.runtimeStorage = runtimeStorage;
        this.resources = resources;
    }

    @Override
    public byte[] read(AvatarAssetSource source, String assetKey) {
        if (source == null || assetKey == null || assetKey.isBlank()) {
            throw new NoSuchElementException("Image not found");
        }
        return switch (source) {
            case OFFICIAL -> readOfficial(assetKey);
            case RUNTIME -> runtimeStorage.read(assetKey);
        };
    }

    private byte[] readOfficial(String assetKey) {
        if (assetKey.contains("..") || assetKey.contains("/") || assetKey.contains("\\")) {
            throw new NoSuchElementException("Image not found");
        }
        Resource resource = resources.getResource(OFFICIAL_ASSET_LOCATION + assetKey);
        if (!resource.exists()) {
            throw new NoSuchElementException("Image not found");
        }
        try (var input = resource.getInputStream()) {
            return input.readAllBytes();
        } catch (IOException exception) {
            throw new NoSuchElementException("Image not found");
        }
    }
}
