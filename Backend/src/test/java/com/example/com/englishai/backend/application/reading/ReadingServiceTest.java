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
        return new ObjectMapper().writeValueAsString(Map.of("title", "Anna's Walk to School", "text", text, "language", language));
    }

    @ParameterizedTest @EnumSource(ConversationDifficulty.class)
    void generatesEnglishWithLevelSpecificGuidance(ConversationDifficulty difficulty) throws Exception {
        respond(passage(PASSAGE, "en"));
        var result = service.generate(difficulty, ReadingTopic.TRAVEL);
        assertThat(result.title()).isEqualTo("Anna's Walk to School");
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
    @Test void rejectsMissingOrGenericTitle() throws Exception {
        respond("{\"language\":\"en\",\"text\":\"A real passage.\"}");
        assertThatThrownBy(() -> service.generate(ConversationDifficulty.BEGINNER, ReadingTopic.TRAVEL)).isInstanceOf(LlmProviderException.class);
        respond(passage(PASSAGE, "en").replace("Anna's Walk to School", "TRAVEL"));
        assertThatThrownBy(() -> service.generate(ConversationDifficulty.BEGINNER, ReadingTopic.TRAVEL)).isInstanceOf(LlmProviderException.class);
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
                && r.systemPrompt().contains("C1-C2") && r.systemPrompt().contains("complete expression")
                && r.systemPrompt().contains("exact contiguous excerpt") && r.systemPrompt().contains("not just a dictionary translation")
                && r.systemPrompt().contains("up to 4") && r.systemPrompt().contains("including zero")
                && r.userPrompt().contains("<reading>")));
    }
    @ParameterizedTest @EnumSource(ConversationDifficulty.class)
    void hintSelectionGuidanceAdaptsToLevel(ConversationDifficulty difficulty) {
        respond("{\"items\":[]}");
        assertThat(service.hint(PASSAGE, difficulty).items()).isEmpty();
        int limit = switch (difficulty) { case BEGINNER -> 10; case INTERMEDIATE -> 7; case ADVANCED -> 4; };
        verify(provider).complete(argThat(r -> r.systemPrompt().contains(difficulty.cefrRange())
                && r.systemPrompt().contains("up to " + limit + " genuinely useful hints")
                && r.systemPrompt().contains("word frequency")
                && r.systemPrompt().contains("phrasal verbs")
                && r.systemPrompt().contains("collocations")
                && r.systemPrompt().contains("Never add trivial hints to fill a quota")));
    }
    @Test void acceptsVariableHintCountAndRejectsTermsAbsentFromThePassage() {
        respond("{\"items\":[{\"expression\":\"along the way\",\"explanation\":\"No texto, durante o caminho.\",\"type\":\"EXPRESSION\"},"
                + "{\"expression\":\"talking\",\"explanation\":\"Aqui, conversar com os amigos.\",\"type\":\"VOCABULARY\"},"
                + "{\"expression\":\"forward\",\"explanation\":\"NÃ£o ocorre no texto.\",\"type\":\"VOCABULARY\"}]}");
        assertThat(service.hint(PASSAGE, ConversationDifficulty.BEGINNER).items())
                .extracting(ReadingService.HintItem::expression).containsExactly("along the way", "talking");
    }
    @ParameterizedTest @EnumSource(ConversationDifficulty.class)
    void capsHintsByLevelAndDiscardsInvalidOrUnrelatedItems(ConversationDifficulty difficulty) throws Exception {
        String text = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november.";
        var items = new ArrayList<Map<String, String>>();
        items.add(Map.of("expression", "unrelated", "explanation", "Invalid", "type", "VOCABULARY"));
        items.add(Map.of("expression", "alpha", "explanation", "Invalid", "type", "BAD"));
        for (String word : text.replace(".", "").split(" "))
            items.add(Map.of("expression", word, "explanation", "Explicação curta.", "type", "VOCABULARY"));
        respond(new ObjectMapper().writeValueAsString(Map.of("items", items)));
        int limit = switch (difficulty) { case BEGINNER -> 10; case INTERMEDIATE -> 7; case ADVANCED -> 4; };
        assertThat(service.hint(text, difficulty).items()).hasSize(limit)
                .allMatch(item -> text.contains(item.expression()));
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

    @Test void listForUserMapsOnlyRepositoryResultsInCreatedAtOrder() {
        var activities = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.class);
        var questions = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingQuestionJpaRepository.class);
        var persisted = new ReadingService(provider, activities, questions, java.time.Clock.systemUTC());
        UUID userId = UUID.randomUUID();
        var newest = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.SummaryView.class);
        var older = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.SummaryView.class);
        UUID newestId = UUID.randomUUID(), olderId = UUID.randomUUID();
        when(newest.getActivityId()).thenReturn(newestId);
        when(newest.getTitle()).thenReturn("Newest passage");
        when(older.getActivityId()).thenReturn(olderId);
        when(older.getTitle()).thenReturn("Older passage");
        when(activities.findSummariesByUserId(eq(userId), any())).thenReturn(List.of(newest, older));

        var summaries = persisted.listForUser(userId);
        assertThat(summaries).extracting(ReadingService.ActivitySummary::activityId)
                .containsExactly(newestId, olderId);
        assertThat(summaries).extracting(ReadingService.ActivitySummary::title)
                .containsExactly("Newest passage", "Older passage");
        verify(activities).findSummariesByUserId(eq(userId), any());
        verifyNoInteractions(questions);
    }

    @Test void firstReadingIsAllowedAndSecondInProgressReadingIsRejectedBeforeGeneration() throws Exception {
        var activities = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.class);
        var questions = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingQuestionJpaRepository.class);
        var persisted = new ReadingService(provider, activities, questions, java.time.Clock.systemUTC());
        UUID userId = UUID.randomUUID();
        respond(passage(PASSAGE, "en"));
        when(activities.existsByUserIdAndStatus(userId, com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.ReadingActivityStatus.IN_PROGRESS))
                .thenReturn(false, true);
        when(activities.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(persisted.generateForUser(userId, ConversationDifficulty.BEGINNER, ReadingTopic.TRAVEL).activityId()).isNotNull();
        assertThatThrownBy(() -> persisted.generateForUser(userId, ConversationDifficulty.BEGINNER, ReadingTopic.TRAVEL))
                .isInstanceOf(ReadingActivityInProgressException.class);
        verify(provider, times(2)).complete(any());
    }

    @Test void generatedHintsAreStoredWithTheReadingAndReturnedFromItsDetail() throws Exception {
        var activities = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.class);
        var questions = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingQuestionJpaRepository.class);
        var persisted = new ReadingService(provider, activities, questions, java.time.Clock.systemUTC());
        UUID userId = UUID.randomUUID();
        when(provider.complete(any())).thenReturn(new LlmResponse(passage(PASSAGE, "en")),
                new LlmResponse("{\"items\":[{\"expression\":\"along the way\",\"explanation\":\"No texto, durante o caminho.\",\"type\":\"EXPRESSION\"}]}"));
        when(activities.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        var reading = persisted.generateForUser(userId, ConversationDifficulty.INTERMEDIATE, ReadingTopic.TRAVEL);
        var saved = org.mockito.ArgumentCaptor.forClass(com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.class);
        verify(activities).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getHints()).extracting(ReadingService.HintItem::expression).containsExactly("along the way");
        when(activities.findByIdAndUserId(reading.activityId(), userId)).thenReturn(Optional.of(saved.getValue()));
        when(questions.findByActivityIdOrderByQuestionNumber(reading.activityId())).thenReturn(List.of());
        assertThat(persisted.detailForUser(userId, reading.activityId()).hints()).containsExactlyElementsOf(saved.getValue().getHints());
    }

    @Test void temporaryHintFailureDoesNotDiscardTheGeneratedReading() throws Exception {
        var activities = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.class);
        var questions = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingQuestionJpaRepository.class);
        var persisted = new ReadingService(provider, activities, questions, java.time.Clock.systemUTC());
        when(provider.complete(any())).thenReturn(new LlmResponse(passage(PASSAGE, "en")))
                .thenThrow(new LlmProviderException("unavailable"));
        when(activities.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        assertThat(persisted.generateForUser(UUID.randomUUID(), ConversationDifficulty.BEGINNER, ReadingTopic.TRAVEL).activityId()).isNotNull();
        var saved = org.mockito.ArgumentCaptor.forClass(com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.class);
        verify(activities).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getHints()).isNull();
    }

    @Test void legacyReadingGeneratesHintsOnceAndThenReusesPersistedItems() {
        var activities = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.class);
        var questions = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingQuestionJpaRepository.class);
        var persisted = new ReadingService(provider, activities, questions, java.time.Clock.systemUTC());
        UUID userId = UUID.randomUUID(), activityId = UUID.randomUUID();
        var activity = new com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity(
                activityId, userId, ConversationDifficulty.BEGINNER, ReadingTopic.TRAVEL, "A walk", PASSAGE, java.time.OffsetDateTime.now());
        when(activities.findByIdAndUserId(activityId, userId)).thenReturn(Optional.of(activity));
        when(activities.findForUpdateByIdAndUserId(activityId, userId)).thenReturn(Optional.of(activity));
        respond("{\"items\":[{\"expression\":\"along the way\",\"explanation\":\"Durante o caminho.\",\"type\":\"EXPRESSION\"}]}");
        assertThat(persisted.hintsForActivity(userId, activityId).items()).hasSize(1);
        assertThat(persisted.hintsForActivity(userId, activityId).items()).hasSize(1);
        verify(provider, times(1)).complete(any());
        verify(activities, times(1)).saveAndFlush(activity);
    }

    @Test void concurrentInsertConflictIsReturnedAsTheSameBusinessRule() throws Exception {
        var activities = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.class);
        var questions = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingQuestionJpaRepository.class);
        var persisted = new ReadingService(provider, activities, questions, java.time.Clock.systemUTC());
        UUID userId = UUID.randomUUID();
        respond(passage(PASSAGE, "en"));
        when(activities.existsByUserIdAndStatus(userId, com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.ReadingActivityStatus.IN_PROGRESS))
                .thenReturn(false);
        when(activities.saveAndFlush(any())).thenThrow(new org.springframework.dao.DataIntegrityViolationException("uk_reading_activity_one_in_progress_per_user"));

        assertThatThrownBy(() -> persisted.generateForUser(userId, ConversationDifficulty.BEGINNER, ReadingTopic.TRAVEL))
                .isInstanceOf(ReadingActivityInProgressException.class);
    }

    @Test void detailUsesOwnershipScopedLookupAndHidesAnswersBeforeCompletion() {
        var activities = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.class);
        var questions = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingQuestionJpaRepository.class);
        var persisted = new ReadingService(provider, activities, questions, java.time.Clock.systemUTC());
        UUID userId = UUID.randomUUID();
        UUID activityId = UUID.randomUUID();
        var activity = new com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity(
                activityId, userId, ConversationDifficulty.INTERMEDIATE, ReadingTopic.CULTURE, "Cultural passage", "A passage", java.time.OffsetDateTime.now());
        var question = new com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingQuestionEntity(
                UUID.randomUUID(), activityId, 1,
                new ReadingService.Question(UUID.randomUUID(), ReadingService.QuestionType.DETAIL,
                        "Where?", List.of("A", "B", "C", "D"), 2, "Explanation"));
        when(activities.findByIdAndUserId(activityId, userId)).thenReturn(Optional.of(activity));
        when(questions.findByActivityIdOrderByQuestionNumber(activityId)).thenReturn(List.of(question));

        var detail = persisted.detailForUser(userId, activityId);
        assertThat(detail.questions()).singleElement().satisfies(value -> {
            assertThat(value.correctOption()).isNull();
            assertThat(value.explanation()).isNull();
        });
        verify(activities).findByIdAndUserId(activityId, userId);
    }

    @Test void detailRejectsAnActivityThatDoesNotBelongToTheUser() {
        var activities = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.class);
        var questions = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingQuestionJpaRepository.class);
        var persisted = new ReadingService(provider, activities, questions, java.time.Clock.systemUTC());
        UUID userId = UUID.randomUUID();
        UUID activityId = UUID.randomUUID();
        when(activities.findByIdAndUserId(activityId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> persisted.detailForUser(userId, activityId))
                .isInstanceOf(NoSuchElementException.class);
        verifyNoInteractions(questions);
    }

    @Test void completedDetailExposesPersistedResultAndQuestionFeedbackWithoutRegeneration() {
        var activities = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.class);
        var questions = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingQuestionJpaRepository.class);
        var persisted = new ReadingService(provider, activities, questions, java.time.Clock.systemUTC());
        UUID userId = UUID.randomUUID();
        UUID activityId = UUID.randomUUID();
        var activity = new com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity(
                activityId, userId, ConversationDifficulty.INTERMEDIATE, ReadingTopic.CULTURE, "A Cultural Passage", "A passage", java.time.OffsetDateTime.now());
        activity.complete(2, 67, com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.ReadingActivityStatus.SUCCESS, java.time.OffsetDateTime.now());
        var question = new com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingQuestionEntity(
                UUID.randomUUID(), activityId, 1,
                new ReadingService.Question(UUID.randomUUID(), ReadingService.QuestionType.DETAIL,
                        "Where?", List.of("A", "B", "C", "D"), 2, "Explanation"));
        when(activities.findByIdAndUserId(activityId, userId)).thenReturn(Optional.of(activity));
        when(questions.findByActivityIdOrderByQuestionNumber(activityId)).thenReturn(List.of(question));

        var detail = persisted.detailForUser(userId, activityId);
        assertThat(detail.status()).isEqualTo(com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.ReadingActivityStatus.SUCCESS);
        assertThat(detail.correctAnswers()).isEqualTo(2);
        assertThat(detail.comprehensionPercentage()).isEqualTo(67);
        assertThat(detail.questions()).singleElement().satisfies(value -> {
            assertThat(value.correctOption()).isEqualTo(2);
            assertThat(value.explanation()).isEqualTo("Explanation");
        });
        verify(provider, never()).complete(any());
    }

    @Test void deletesOnlyOwnedInProgressActivityAndFlushesCascadeDelete() {
        var activities = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.class);
        var questions = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingQuestionJpaRepository.class);
        var persisted = new ReadingService(provider, activities, questions, java.time.Clock.systemUTC());
        UUID userId = UUID.randomUUID();
        UUID activityId = UUID.randomUUID();
        var activity = new com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity(
                activityId, userId, ConversationDifficulty.BEGINNER, ReadingTopic.TRAVEL, "A Travel Passage", "A passage", java.time.OffsetDateTime.now());
        when(activities.findForUpdateByIdAndUserId(activityId, userId)).thenReturn(Optional.of(activity));

        persisted.deleteInProgressForUser(userId, activityId);

        verify(activities).delete(activity);
        verify(activities).flush();
    }

    @Test void refusesToDeleteCompletedActivity() {
        var activities = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository.class);
        var questions = mock(com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingQuestionJpaRepository.class);
        var persisted = new ReadingService(provider, activities, questions, java.time.Clock.systemUTC());
        UUID userId = UUID.randomUUID();
        UUID activityId = UUID.randomUUID();
        var activity = new com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity(
                activityId, userId, ConversationDifficulty.BEGINNER, ReadingTopic.TRAVEL, "A Travel Passage", "A passage", java.time.OffsetDateTime.now());
        activity.complete(2, 67, com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.ReadingActivityStatus.SUCCESS, java.time.OffsetDateTime.now());
        when(activities.findForUpdateByIdAndUserId(activityId, userId)).thenReturn(Optional.of(activity));

        assertThatThrownBy(() -> persisted.deleteInProgressForUser(userId, activityId))
                .isInstanceOf(IllegalStateException.class);
        verify(activities, never()).delete(any());
        verify(activities, never()).flush();
    }
}
