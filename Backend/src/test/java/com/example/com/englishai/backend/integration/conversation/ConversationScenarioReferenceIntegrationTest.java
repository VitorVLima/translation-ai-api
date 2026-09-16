package com.example.com.englishai.backend.integration.conversation;

import com.example.com.englishai.backend.infrastructure.persistence.entity.*;
import com.example.com.englishai.backend.infrastructure.persistence.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DataIntegrityViolationException;
import java.time.OffsetDateTime;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@Transactional
class ConversationScenarioReferenceIntegrationTest {
    @Autowired UserJpaRepository users;
    @Autowired ConversationJpaRepository conversations;
    @Autowired ScenarioDefinitionJpaRepository scenarios;
    @Autowired jakarta.persistence.EntityManager entityManager;

    private UUID user() {
        var id = UUID.randomUUID(); var now = OffsetDateTime.now();
        users.saveAndFlush(new UserEntity(id, "scenario-" + id + "@test.com", "scenario-" + id,
                "test-hash", now, now, false));
        return id;
    }

    @Test void databaseRejectsUnknownScenarioWithoutSilentlySubstitutingFreeTalk() {
        var owner = user();
        assertThatThrownBy(() -> conversations.saveAndFlush(new ConversationEntity(UUID.randomUUID(), owner,
                "MISSING_" + UUID.randomUUID().toString().replace("-", "").toUpperCase(java.util.Locale.ROOT), "en", "Test", OffsetDateTime.now())))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_conversations_scenario");
    }

    @Test void databaseRejectsNullScenario() {
        var owner = user();
        assertThatThrownBy(() -> conversations.saveAndFlush(new ConversationEntity(UUID.randomUUID(), owner,
                (String) null, "en", "Test", OffsetDateTime.now())))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test void speechSettingsPersistAndExistingScenariosHaveSafeDefaults() {
        var defaultScenario = scenarios.findByScenarioKey("FREE_TALK").orElseThrow();
        assertThat(defaultScenario.getSpeechRate()).isBetween(0.75, 1.25);
        String key = "VOICE_" + UUID.randomUUID().toString().replace("-", "").toUpperCase(java.util.Locale.ROOT);
        var scenario = new ConversationScenarioDefinitionEntity(UUID.randomUUID(), key, "Voice test", "Practice", "Legacy", "tutor_default", "Behavior", true, 0, OffsetDateTime.now());
        assertThat(scenario.getTtsVoice()).isNull();
        assertThat(scenario.getSpeechRate()).isEqualTo(1.0);
        scenario.updateSpeech("en_US-lessac-high", 0.85);
        scenarios.saveAndFlush(scenario);
        entityManager.clear();
        var stored = scenarios.findById(scenario.getId()).orElseThrow();
        assertThat(stored.getTtsVoice()).isEqualTo("en_US-lessac-high");
        assertThat(stored.getSpeechRate()).isEqualTo(0.85);
        assertThat(stored.getBehaviorInstructions()).isEqualTo("Behavior");
        assertThat(stored.getAssistantAvatarKey()).isEqualTo("tutor_default");
    }

    @Test void fullLengthCatalogKeyAndExplicitFreeTalkRemainValid() {
        var owner = user(); var now = OffsetDateTime.now();
        String key = "CUSTOM_" + UUID.randomUUID().toString().replace("-", "").toUpperCase(java.util.Locale.ROOT) + "X".repeat(25);
        assertThat(key.length()).isEqualTo(64);
        scenarios.saveAndFlush(new ConversationScenarioDefinitionEntity(UUID.randomUUID(), key, "Custom", "Practice",
                "Tutor", "tutor_default", "Have a conversation.", true, 0, now));
        var custom = conversations.saveAndFlush(new ConversationEntity(UUID.randomUUID(), owner, key, "en", "Custom", now));
        var free = conversations.saveAndFlush(new ConversationEntity(UUID.randomUUID(), owner, "FREE_TALK", "en", "Free", now));
        entityManager.clear();
        assertThat(conversations.findByIdAndUserId(custom.getId(), owner).orElseThrow().getScenarioKey()).isEqualTo(key);
        assertThat(conversations.findByIdAndUserId(free.getId(), owner).orElseThrow().getScenarioKey()).isEqualTo("FREE_TALK");
    }
}
