package com.example.com.englishai.backend.presentation.rest.admin;

import com.example.com.englishai.backend.application.admin.CatalogService;
import com.example.com.englishai.backend.application.catalog.AvatarAssetSource;
import com.example.com.englishai.backend.application.profile.ProfileImageStorage;
import com.example.com.englishai.backend.infrastructure.persistence.entity.PredefinedAvatarEntity;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdminCatalogControllerTest {
    @Test void replacingOfficialAssetCreatesRuntimeAssetWithoutDeletingTheOfficialResource() {
        CatalogService service = mock(CatalogService.class);
        ProfileImageStorage runtime = mock(ProfileImageStorage.class);
        UUID id = UUID.randomUUID();
        var old = avatar(id, "avatar_01", "avatar-01.png", AvatarAssetSource.OFFICIAL);
        var updated = avatar(id, "avatar_01", "runtime-avatar.png", AvatarAssetSource.RUNTIME);
        when(service.allAvatars()).thenReturn(List.of(old));
        when(runtime.store(any(byte[].class), eq("image/png"))).thenReturn("runtime-avatar.png");
        when(service.saveAvatar(eq(id), eq("avatar_01"), eq("Leo"), eq("runtime-avatar.png"), eq(AvatarAssetSource.RUNTIME), eq(true), eq(1))).thenReturn(updated);
        var controller = new AdminCatalogController(service, runtime);

        controller.replaceAvatarImage(id, "Leo", true, 1, pngFile());

        verify(runtime, never()).delete("avatar-01.png");
        verify(service).saveAvatar(id, "avatar_01", "Leo", "runtime-avatar.png", AvatarAssetSource.RUNTIME, true, 1);
    }

    @Test void replacingRuntimeAssetKeepsExistingCleanupPolicy() {
        CatalogService service = mock(CatalogService.class);
        ProfileImageStorage runtime = mock(ProfileImageStorage.class);
        UUID id = UUID.randomUUID();
        var old = avatar(id, "avatar_01", "old-runtime.png", AvatarAssetSource.RUNTIME);
        var updated = avatar(id, "avatar_01", "new-runtime.png", AvatarAssetSource.RUNTIME);
        when(service.allAvatars()).thenReturn(List.of(old));
        when(runtime.store(any(byte[].class), eq("image/png"))).thenReturn("new-runtime.png");
        when(service.saveAvatar(eq(id), eq("avatar_01"), eq("Leo"), eq("new-runtime.png"), eq(AvatarAssetSource.RUNTIME), eq(true), eq(1))).thenReturn(updated);
        var controller = new AdminCatalogController(service, runtime);

        controller.replaceAvatarImage(id, "Leo", true, 1, pngFile());

        verify(runtime).delete("old-runtime.png");
    }

    @Test void validUploadNeverUsesTheSubmittedFilenameAsAnAssetKey() throws Exception {
        CatalogService service = mock(CatalogService.class);
        ProfileImageStorage runtime = mock(ProfileImageStorage.class);
        when(runtime.store(any(byte[].class), eq("image/png"))).thenReturn("generated.png");
        when(service.saveAvatar(eq(null), eq("avatar_07"), eq("Leo"), eq("generated.png"), eq(true), eq(0)))
                .thenReturn(avatar(UUID.randomUUID(), "avatar_07", "generated.png", AvatarAssetSource.RUNTIME));
        var file = new MockMultipartFile("file", "../outside.png", "image/png", pngFile().getBytes());

        new AdminCatalogController(service, runtime).uploadAvatar("avatar_07", "Leo", true, 0, file);

        verify(runtime).store(any(byte[].class), eq("image/png"));
        verify(service).saveAvatar(null, "avatar_07", "Leo", "generated.png", true, 0);
    }

    @Test void rejectsInvalidSignatureAndOversizedUploadBeforeStorage() {
        CatalogService service = mock(CatalogService.class);
        ProfileImageStorage runtime = mock(ProfileImageStorage.class);
        var controller = new AdminCatalogController(service, runtime);
        var invalid = new MockMultipartFile("file", "avatar.png", "image/png", new byte[]{1, 2, 3});
        var oversized = new MockMultipartFile("file", "avatar.png", "image/png", new byte[5 * 1024 * 1024 + 1]);

        assertThatThrownBy(() -> controller.uploadAvatar("avatar_07", "Leo", true, 0, invalid))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> controller.uploadAvatar("avatar_07", "Leo", true, 0, oversized))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(runtime);
    }

    @Test void disablingAvatarKeepsItsImageForReactivation() {
        CatalogService service = mock(CatalogService.class);
        ProfileImageStorage runtime = mock(ProfileImageStorage.class);
        UUID id = UUID.randomUUID();

        new AdminCatalogController(service, runtime).disableAvatar(id);

        verify(service).disableAvatar(id);
        verifyNoInteractions(runtime);
    }

    @Test void failedReplacementDeletesOnlyTheNewFile() {
        CatalogService service = mock(CatalogService.class);
        ProfileImageStorage runtime = mock(ProfileImageStorage.class);
        UUID id = UUID.randomUUID();
        when(service.allAvatars()).thenReturn(List.of(avatar(id, "avatar_01", "old-runtime.png", AvatarAssetSource.RUNTIME)));
        when(runtime.store(any(byte[].class), eq("image/png"))).thenReturn("new-runtime.png");
        when(service.saveAvatar(eq(id), eq("avatar_01"), eq("Leo"), eq("new-runtime.png"),
                eq(AvatarAssetSource.RUNTIME), eq(true), eq(1))).thenThrow(new IllegalStateException("db failed"));

        assertThatThrownBy(() -> new AdminCatalogController(service, runtime)
                .replaceAvatarImage(id, "Leo", true, 1, pngFile()))
                .isInstanceOf(IllegalStateException.class);

        verify(runtime).delete("new-runtime.png");
        verify(runtime, never()).delete("old-runtime.png");
    }

    private static PredefinedAvatarEntity avatar(UUID id, String key, String assetKey, AvatarAssetSource source) {
        return new PredefinedAvatarEntity(id, key, "Avatar", assetKey, source, true, 1, OffsetDateTime.now());
    }

    private static MockMultipartFile pngFile() {
        return new MockMultipartFile("file", "avatar.png", "image/png", new byte[]{(byte) 137, 80, 78, 71, 0, 0, 0, 0, 0});
    }
}
