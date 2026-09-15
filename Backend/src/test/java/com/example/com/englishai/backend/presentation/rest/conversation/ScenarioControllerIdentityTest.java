package com.example.com.englishai.backend.presentation.rest.conversation;

import com.example.com.englishai.backend.application.admin.CatalogService;
import com.example.com.englishai.backend.application.catalog.AssistantIdentityResolver;
import com.example.com.englishai.backend.infrastructure.persistence.entity.ConversationScenarioDefinitionEntity;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class ScenarioControllerIdentityTest {
    @Test
    void publicScenarioUsesAvatarDisplayNameInsteadOfScenarioLegacyName() {
        var catalog = mock(CatalogService.class);
        var identities = mock(AssistantIdentityResolver.class);
        var scenario = new ConversationScenarioDefinitionEntity(UUID.randomUUID(), "JOB_INTERVIEW", "Entrevista", "Pratique", "Interviewer", "interviewer_default", "Act as interviewer", true, 1, OffsetDateTime.now());
        when(catalog.publicScenarios()).thenReturn(List.of(scenario));
        when(identities.resolve("interviewer_default")).thenReturn(new AssistantIdentityResolver.AssistantIdentity("Rodrigo", "interviewer_default", "/api/v1/avatars/interviewer_default/image"));

        var response = new ScenarioController(catalog, identities).list().getFirst();

        assertThat(response.assistantDisplayName()).isEqualTo("Rodrigo");
        assertThat(response.assistantAvatarKey()).isEqualTo("interviewer_default");
        assertThat(response.assistantAvatarImageUrl()).isEqualTo("/api/v1/avatars/interviewer_default/image");
        verify(identities).resolve("interviewer_default");
    }
}
