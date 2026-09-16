package com.example.com.englishai.backend.application.admin;

import com.example.com.englishai.backend.application.ports.TextToSpeechProvider;
import com.example.com.englishai.backend.application.tts.*;
import com.example.com.englishai.backend.infrastructure.persistence.entity.*;
import com.example.com.englishai.backend.infrastructure.persistence.repository.*;
import org.junit.jupiter.api.Test;
import java.time.OffsetDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ScenarioSpeechSettingsTest {
    @Test void adminSavesValidatedVoiceAndRateWithoutChangingIdentityOrBehavior() {
        var avatars = mock(PredefinedAvatarJpaRepository.class);
        var scenarios = mock(ScenarioDefinitionJpaRepository.class);
        var provider = mock(TextToSpeechProvider.class);
        var catalog = new CatalogService(avatars, scenarios, provider);
        var entity = new ConversationScenarioDefinitionEntity(UUID.randomUUID(), "TEST_VOICE", "Test", "Description", "Legacy", "avatar", "Behavior", true, 0, OffsetDateTime.now());
        when(avatars.existsByAvatarKey("avatar")).thenReturn(true);
        when(scenarios.findById(entity.getId())).thenReturn(Optional.of(entity));
        when(scenarios.save(any())).thenAnswer(call -> call.getArgument(0));
        when(provider.voices()).thenReturn(List.of(new TtsVoice("en_US-lessac-high", "Lessac High", "en")));
        var result = catalog.saveScenario(entity.getId(), "TEST_VOICE", "Test", "Description", "Legacy", "avatar", "Behavior", true, 0, "en_US-lessac-high", 1.1);
        assertThat(result.getTtsVoice()).isEqualTo("en_US-lessac-high");
        assertThat(result.getSpeechRate()).isEqualTo(1.1);
        assertThat(result.getAssistantAvatarKey()).isEqualTo("avatar");
        assertThat(result.getBehaviorInstructions()).isEqualTo("Behavior");
        assertThatThrownBy(() -> catalog.saveScenario(entity.getId(), "TEST_VOICE", "Test", "Description", "Legacy", "avatar", "Behavior", true, 0, "unknown", 1.0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> catalog.saveScenario(entity.getId(), "TEST_VOICE", "Test", "Description", "Legacy", "avatar", "Behavior", true, 0, "en_US-lessac-high", 1.26)).isInstanceOf(InvalidTextToSpeechRequestException.class);
        // Older clients omit both fields; retain the saved settings, including while toggling enabled.
        catalog.saveScenario(entity.getId(), "TEST_VOICE", "Test", "Description", "Legacy", "avatar", "Behavior", false, 0, null, null);
        assertThat(entity.getTtsVoice()).isEqualTo("en_US-lessac-high");
        assertThat(entity.getSpeechRate()).isEqualTo(1.1);
        catalog.saveScenario(entity.getId(), "TEST_VOICE", "Test", "Description", "Legacy", "avatar", "Behavior", true, 0, "", 1.0);
        assertThat(entity.getTtsVoice()).isNull();
    }
}
