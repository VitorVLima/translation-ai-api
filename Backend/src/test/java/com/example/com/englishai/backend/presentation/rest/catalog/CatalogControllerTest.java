package com.example.com.englishai.backend.presentation.rest.catalog;

import com.example.com.englishai.backend.application.admin.CatalogService;
import com.example.com.englishai.backend.application.catalog.AvatarAssetSource;
import com.example.com.englishai.backend.application.catalog.AvatarImageStorage;
import com.example.com.englishai.backend.infrastructure.persistence.entity.PredefinedAvatarEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.PredefinedAvatarJpaRepository;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class CatalogControllerTest {
    @Test void servesOfficialAvatarWithoutChangingThePublicUrlContract() {
        CatalogService service = mock(CatalogService.class);
        PredefinedAvatarJpaRepository avatars = mock(PredefinedAvatarJpaRepository.class);
        AvatarImageStorage images = mock(AvatarImageStorage.class);
        var avatar = avatar("avatar_01", "avatar-01.png", AvatarAssetSource.OFFICIAL);
        when(service.publicAvatars()).thenReturn(List.of(avatar));
        when(avatars.findByAvatarKey("avatar_01")).thenReturn(Optional.of(avatar));
        when(images.read(AvatarAssetSource.OFFICIAL, "avatar-01.png")).thenReturn(new byte[]{7, 8});
        var controller = new CatalogController(service, avatars, images);

        assertThat(controller.avatars()).containsExactly(new CatalogController.AvatarResponse("avatar_01", "Avatar", "/api/v1/avatars/avatar_01/image"));
        var response = controller.image("avatar_01");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getContentType().toString()).isEqualTo("image/png");
        assertThat(response.getBody()).containsExactly(7, 8);
        verify(images).read(AvatarAssetSource.OFFICIAL, "avatar-01.png");
    }

    private static PredefinedAvatarEntity avatar(String key, String assetKey, AvatarAssetSource source) {
        return new PredefinedAvatarEntity(UUID.randomUUID(), key, "Avatar", assetKey, source, true, 0, OffsetDateTime.now());
    }
}
