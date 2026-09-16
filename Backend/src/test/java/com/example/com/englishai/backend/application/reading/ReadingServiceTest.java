package com.example.com.englishai.backend.application.reading;

import com.example.com.englishai.backend.application.conversation.ConversationDifficulty;
import com.example.com.englishai.backend.application.llm.*;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReadingServiceTest {
    final LlmProvider provider = mock(LlmProvider.class);
    final ReadingService service = new ReadingService(provider);
    static final String PASSAGE = "Every morning, Anna walks to school. She enjoys talking to her friends along the way.";

    void respond(String raw) { when(provider.complete(any())).thenReturn(new LlmResponse(raw)); }
    String passage(String text, String language) throws Exception {
        return new ObjectMapper().writeValueAsString(Map.of("text", text, "language", language));
    }

    @ParameterizedTest @EnumSource(ConversationDifficulty.class)
    void generatesEnglishWithLevelSpecificGuidance(ConversationDifficulty difficulty) throws Exception {
        respond(passage(PASSAGE, "en"));
        var result = service.generate(difficulty, ReadingTopic.TRAVEL);
        assertThat(result.text()).isEqualTo(PASSAGE);
        assertThat(result.difficulty()).isEqualTo(difficulty);
        assertThat(result.topic()).isEqualTo(ReadingTopic.TRAVEL);
        String range = switch (difficulty) { case BEGINNER -> "80-130"; case INTERMEDIATE -> "130-220"; case ADVANCED -> "200-300"; };
        String guidance = switch (difficulty) { case BEGINNER -> "short clear sentences"; case INTERMEDIATE -> "phrasal verbs"; case ADVANCED -> "nuance"; };
        verify(provider, times(1)).complete(argThat(r -> r.responseFormat() == LlmResponseFormat.JSON
                && r.systemPrompt().contains(range) && r.systemPrompt().contains(guidance)
                && r.systemPrompt().contains("ONLY in English") && r.userPrompt().contains("TRAVEL") && r.history() == null));
    }
    @ParameterizedTest @EnumSource(ReadingTopic.class)
    void supportsAllControlledTopics(ReadingTopic topic) throws Exception {
        respond(passage(PASSAGE, "en"));
        assertThat(service.generate(ConversationDifficulty.INTERMEDIATE, topic).topic()).isEqualTo(topic);
        verify(provider).complete(argThat(r -> r.userPrompt().contains(topic.name())));
    }
    @Test void acceptsExactly300WordsAndRejects301AndExcessiveCharacters() throws Exception {
        respond(passage("word ".repeat(300).strip(), "en"));
        assertThat(service.generate(ConversationDifficulty.ADVANCED, ReadingTopic.WORK).text().split(" ")).hasSize(300);
        for (String invalid : List.of("word ".repeat(301), "x".repeat(5001))) {
            respond(passage(invalid, "en"));
            assertThatThrownBy(() -> service.generate(ConversationDifficulty.ADVANCED, ReadingTopic.WORK)).isInstanceOf(LlmProviderException.class);
        }
    }
    @Test void rejectsDeclaredPortugueseAndDoesNotExposeItAsReading() throws Exception {
        respond(passage("Eu vou à escola todos os dias.", "pt"));
        assertThatThrownBy(() -> service.generate(ConversationDifficulty.BEGINNER, ReadingTopic.DAILY_LIFE)).isInstanceOf(LlmProviderException.class);
    }
    @ParameterizedTest @ValueSource(strings = {"not json", "null", "[]", "{}", "{\"language\":\"en\",\"text\":42}", "{\"language\":\"en\",\"text\":\" \"}"})
    void rejectsMalformedGeneration(String raw) {
        respond(raw);
        assertThatThrownBy(() -> service.generate(ConversationDifficulty.BEGINNER, ReadingTopic.CULTURE)).isInstanceOf(LlmProviderException.class);
    }
    @Test void acceptsFencedStructuredResponse() throws Exception {
        respond("```json\n" + passage(PASSAGE, "en") + "\n```");
        assertThat(service.generate(ConversationDifficulty.INTERMEDIATE, ReadingTopic.TECHNOLOGY).text()).isEqualTo(PASSAGE);
    }
    @Test void hintsUsePortugueseToExplainEnglishAtThePersistedExerciseLevel() {
        respond("{\"items\":[{\"expression\":\"along the way\",\"explanation\":\"Significa durante o caminho.\",\"type\":\"EXPRESSION\"}]}");
        var result = service.hint(PASSAGE, ConversationDifficulty.ADVANCED);
        assertThat(result.items()).containsExactly(new ReadingService.HintItem("along the way", "Significa durante o caminho.", ReadingService.HintType.EXPRESSION));
        verify(provider).complete(argThat(r -> r.systemPrompt().contains("ADVANCED") && r.systemPrompt().contains("Brazilian Portuguese")
                && r.systemPrompt().contains("Do not translate the whole passage") && r.systemPrompt().contains("avoid basic words")
                && r.userPrompt().contains("<reading>")));
    }
    @Test void capsHintsAtFiveAndDiscardsInvalidOrUnrelatedItems() throws Exception {
        var items = new ArrayList<Map<String, String>>();
        items.add(Map.of("expression", "unrelated", "explanation", "Invalid", "type", "VOCABULARY"));
        items.add(Map.of("expression", "morning", "explanation", "Invalid", "type", "BAD"));
        for (String word : List.of("morning", "walks", "school", "enjoys", "talking", "friends"))
            items.add(Map.of("expression", word, "explanation", "Explicação curta.", "type", "VOCABULARY"));
        respond(new ObjectMapper().writeValueAsString(Map.of("items", items)));
        assertThat(service.hint(PASSAGE, ConversationDifficulty.BEGINNER).items()).hasSize(5)
                .allMatch(item -> PASSAGE.contains(item.expression()));
    }
    @ParameterizedTest @ValueSource(strings = {"not json", "null", "{}", "{\"items\":42}", "{\"items\":[{}]}"})
    void invalidHintsFallBackToEmptyItems(String raw) {
        respond(raw);
        assertThat(service.hint(PASSAGE, ConversationDifficulty.INTERMEDIATE).items()).isEmpty();
    }
    @Test void invalidHintInputIsRejectedBeforeProviderAndProviderFailureIsControlled() {
        assertThatThrownBy(() -> service.hint("word ".repeat(301), ConversationDifficulty.BEGINNER)).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(provider);
        when(provider.complete(any())).thenThrow(new LlmProviderException("unavailable"));
        assertThatThrownBy(() -> service.hint(PASSAGE, ConversationDifficulty.BEGINNER)).isInstanceOf(LlmProviderException.class);
    }
    @Test void questionsRequireThreeDistinctTypesAndFourOptions() {
        respond("{\"questions\":["
                + "{\"type\":\"MAIN_IDEA\",\"question\":\"What is this about?\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correctOption\":0,\"explanation\":\"A explicacao.\"},"
                + "{\"type\":\"DETAIL\",\"question\":\"Who walks?\",\"options\":[\"Anna\",\"Ben\",\"Cara\",\"Dan\"],\"correctOption\":0,\"explanation\":\"O texto informa isso.\"},"
                + "{\"type\":\"VOCABULARY\",\"question\":\"What does along the way mean?\",\"options\":[\"During the journey\",\"At home\",\"Tomorrow\",\"Never\"],\"correctOption\":0,\"explanation\":\"Significa durante o caminho.\"}]}" );
        var result = service.questions(PASSAGE, ConversationDifficulty.INTERMEDIATE);
        assertThat(result.questions()).hasSize(3).allSatisfy(question -> assertThat(question.options()).hasSize(4));
        assertThat(result.questions()).extracting(ReadingService.Question::type)
                .containsExactly(ReadingService.QuestionType.MAIN_IDEA, ReadingService.QuestionType.DETAIL, ReadingService.QuestionType.VOCABULARY);
        verify(provider).complete(argThat(request -> request.systemPrompt().contains("exactly three")
                && request.systemPrompt().contains("Brazilian Portuguese") && request.userPrompt().contains("<reading>")));
    }
    @ParameterizedTest @ValueSource(strings = {"{}", "{\"questions\":[]}", "{\"questions\":[{}]}",
            "{\"questions\":[{\"type\":\"MAIN_IDEA\",\"question\":\"x\",\"options\":[\"a\"],\"correctOption\":0,\"explanation\":\"x\"}]}"})
    void malformedQuestionsFallBackToEmptyList(String raw) {
        respond(raw);
        assertThat(service.questions(PASSAGE, ConversationDifficulty.BEGINNER).questions()).isEmpty();
    }
}
