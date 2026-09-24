package com.example.com.englishai.backend.application.catalog;

/** Reads catalog avatar bytes without exposing their physical storage to HTTP controllers. */
public interface AvatarImageStorage {
    byte[] read(AvatarAssetSource source, String assetKey);
}
