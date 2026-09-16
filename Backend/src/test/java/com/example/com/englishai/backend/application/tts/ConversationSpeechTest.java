package com.example.com.englishai.backend.application.tts;

import com.example.com.englishai.backend.application.conversation.ConversationService;
import com.example.com.englishai.backend.application.ports.TextToSpeechProvider;
import com.example.com.englishai.backend.application.translation.Language;
import com.example.com.englishai.backend.infrastructure.persistence.entity.*;
import com.example.com.englishai.backend.infrastructure.persistence.repository.ScenarioDefinitionJpaRepository;
import org.junit.jupiter.api.Test;
import java.time.OffsetDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConversationSpeechTest {
    @Test void resolvesCurrentScenarioSettingsEachTimeAndEnforcesOwnership() {
        var conversations = mock(ConversationService.class);
        var scenarios = mock(ScenarioDefinitionJpaRepository.class);
        var provider = mock(TextToSpeechProvider.class);
        when(provider.synthesize(any())).thenReturn(new TextToSpeechResult(new byte[]{1}, "audio/wav"));
        var speech = new ConversationSpeech(conversations, scenarios, new SynthesizeSpeech(provider, 3000));
        var owner = UUID.randomUUID(); var id = UUID.randomUUID(); var now = OffsetDateTime.now();
        var scenario = new ConversationScenarioDefinitionEntity(UUID.randomUUID(), "TEST_SCENARIO", "Test", "Practice", "Legacy", "avatar", "Behavior", true, 0, now);
        scenario.updateSpeech("en_US-lessac-high", 0.8);
        when(conversations.require(owner, id)).thenReturn(new ConversationEntity(id, owner, "TEST_SCENARIO", "en", "Test", now));
        when(scenarios.findByScenarioKey("TEST_SCENARIO")).thenReturn(Optional.of(scenario));
        speech.execute(owner, id, "Hello");
        verify(provider).synthesize(new TextToSpeechRequest("Hello", Language.ENGLISH, new SpeechSettings("en_US-lessac-high", 0.8)));
        scenario.updateSpeech("pt_BR-faber-medium", 1.2);
        scenario.disable(now);
        speech.execute(owner, id, "Again");
        verify(provider).synthesize(new TextToSpeechRequest("Again", Language.ENGLISH, new SpeechSettings("pt_BR-faber-medium", 1.2)));
        var foreign = UUID.randomUUID();
        when(conversations.require(foreign, id)).thenThrow(new NoSuchElementException());
        assertThatThrownBy(() -> speech.execute(foreign, id, "Secret")).isInstanceOf(NoSuchElementException.class);
        verify(provider, times(2)).synthesize(any());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(doubles = {0.74, 1.26, -1, Double.NaN, Double.POSITIVE_INFINITY})
    void invalidRateIsRejected(double rate) {
        assertThatThrownBy(() -> new SpeechSettings(null, rate)).isInstanceOf(InvalidTextToSpeechRequestException.class);
    }
    @Test void genericToolsStillUseLanguageDefaultsWithoutConversation() {
        var provider = mock(TextToSpeechProvider.class);
        when(provider.synthesize(any())).thenReturn(new TextToSpeechResult(new byte[]{1}, "audio/wav"));
        var speech = new SynthesizeSpeech(provider, 3000);
        for (var language : Language.values()) {
            speech.execute(new SynthesizeSpeechCommand("Text", language));
            verify(provider).synthesize(new TextToSpeechRequest("Text", language, SpeechSettings.DEFAULT));
        }
    }
}
