package com.example.com.englishai.backend.application.admin;
import com.example.com.englishai.backend.application.catalog.AvatarAssetSource;
import com.example.com.englishai.backend.infrastructure.persistence.entity.*;
import com.example.com.englishai.backend.infrastructure.persistence.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;

@Service
public class CatalogService {
    private final PredefinedAvatarJpaRepository avatars;
    private final ScenarioDefinitionJpaRepository scenarios;
    private final com.example.com.englishai.backend.application.ports.TextToSpeechProvider speech;

    public CatalogService(
            PredefinedAvatarJpaRepository a,
            ScenarioDefinitionJpaRepository s,
            com.example.com.englishai.backend.application.ports.TextToSpeechProvider speech
    ) {
        avatars = a;
        scenarios = s;
        this.speech = speech;
    }

    public List<PredefinedAvatarEntity> publicAvatars() {
        return avatars.findByEnabledTrueOrderBySortOrderAsc().stream()
                .filter(a -> a.getAvatarKey() != null && a.getAvatarKey().matches("avatar_[0-9]+"))
                .toList();
    }

    public List<PredefinedAvatarEntity> allAvatars() {
        return avatars.findAll();
    }

    @Transactional
    public PredefinedAvatarEntity saveAvatar(
            UUID id,
            String key,
            String name,
            String asset,
            boolean enabled,
            int order
    ) {
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        if (id == null) {
            if (avatars.existsByAvatarKey(key)) {
                throw new IllegalArgumentException("Duplicate avatar key");
            }
            return avatars.saveAndFlush(new PredefinedAvatarEntity(
                    UUID.randomUUID(), key, name, asset, AvatarAssetSource.RUNTIME, enabled, order, now));
        }
        var e = avatars.findById(id).orElseThrow();
        e.update(name, asset, e.getAssetSource(), enabled, order, now);
        return avatars.saveAndFlush(e);
    }

    @Transactional
    public PredefinedAvatarEntity saveAvatar(
            UUID id,
            String key,
            String name,
            String asset,
            AvatarAssetSource source,
            boolean enabled,
            int order
    ) {
        if (id == null) {
            throw new IllegalArgumentException("Avatar id is required");
        }
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        var e = avatars.findById(id).orElseThrow();
        e.update(name, asset, source, enabled, order, now);
        return avatars.saveAndFlush(e);
    }

    @Transactional
    public void disableAvatar(UUID id) {
        avatars.findById(id).orElseThrow().disable(OffsetDateTime.now(ZoneOffset.UTC));
    }

    public List<ConversationScenarioDefinitionEntity> publicScenarios() {
        return scenarios.findByEnabledTrueOrderBySortOrderAsc();
    }

    public List<ConversationScenarioDefinitionEntity> allScenarios() {
        return scenarios.findAll();
    }

    public ConversationScenarioDefinitionEntity requireScenario(String key, boolean active) {
        var e = scenarios.findByScenarioKey(key).orElseThrow(() -> new NoSuchElementException("Scenario not found"));
        if (active && !e.isEnabled()) {
            throw new IllegalStateException("Scenario disabled");
        }
        return e;
    }

    @Transactional
    public ConversationScenarioDefinitionEntity saveScenario(
            UUID id,
            String key,
            String display,
            String desc,
            String assistant,
            String avatar,
            String behavior,
            boolean enabled,
            int order,
            String voice,
            Double rate
    ) {
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        if (id == null && scenarios.existsByScenarioKey(key)) {
            throw new IllegalArgumentException("Duplicate scenario key");
        }
        if (!avatars.existsByAvatarKey(avatar)) {
            throw new IllegalArgumentException("Invalid assistant avatar");
        }
        var e = id == null
                ? new ConversationScenarioDefinitionEntity(
                UUID.randomUUID(), key, display, desc, assistant, avatar, behavior, enabled, order, now)
                : scenarios.findById(id).orElseThrow();
        String nextVoice = voice == null ? e.getTtsVoice() : voice.isBlank() ? null : voice;
        var settings = new com.example.com.englishai.backend.application.tts.SpeechSettings(
                nextVoice, rate == null ? e.getSpeechRate() : rate);
        if (nextVoice != null
                && !Objects.equals(nextVoice, e.getTtsVoice())
                && speech.voices().stream().noneMatch(v -> v.key().equals(nextVoice))) {
            throw new IllegalArgumentException("Unsupported voice");
        }
        if (id != null) {
            e.update(display, desc, assistant, avatar, behavior, enabled, order, now);
        }
        e.updateSpeech(settings.voice(), settings.speechRate());
        return scenarios.save(e);
    }

    @Transactional
    public void disableScenario(UUID id) {
        scenarios.findById(id).orElseThrow().disable(OffsetDateTime.now(ZoneOffset.UTC));
    }
}
