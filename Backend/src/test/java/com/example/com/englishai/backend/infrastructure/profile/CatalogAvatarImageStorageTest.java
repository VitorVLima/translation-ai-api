package com.example.com.englishai.backend.infrastructure.profile;

import com.example.com.englishai.backend.application.catalog.AvatarAssetSource;
import com.example.com.englishai.backend.application.profile.ProfileImageStorage;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.DefaultResourceLoader;

import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class CatalogAvatarImageStorageTest {
    @Test void readsOfficialAssetFromClasspath() {
        ProfileImageStorage runtime = mock(ProfileImageStorage.class);
        var storage = new CatalogAvatarImageStorage(runtime, new DefaultResourceLoader());

        assertThat(storage.read(AvatarAssetSource.OFFICIAL, "avatar-default.png")).isNotEmpty();
        verifyNoInteractions(runtime);
    }

    @Test void readsRuntimeAssetFromFilesystemAdapter() {
        ProfileImageStorage runtime = mock(ProfileImageStorage.class);
        when(runtime.read("runtime-avatar.png")).thenReturn(new byte[]{1, 2, 3});
        var storage = new CatalogAvatarImageStorage(runtime, new DefaultResourceLoader());

        assertThat(storage.read(AvatarAssetSource.RUNTIME, "runtime-avatar.png")).containsExactly(1, 2, 3);
        verify(runtime).read("runtime-avatar.png");
    }

    @Test void keepsMissingAssetBehavior() {
        var storage = new CatalogAvatarImageStorage(mock(ProfileImageStorage.class), new DefaultResourceLoader());

        assertThatThrownBy(() -> storage.read(AvatarAssetSource.OFFICIAL, "missing.png"))
                .isInstanceOf(NoSuchElementException.class);
    }
}
