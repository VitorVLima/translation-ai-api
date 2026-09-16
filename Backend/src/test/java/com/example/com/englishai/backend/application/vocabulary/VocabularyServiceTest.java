package com.example.com.englishai.backend.application.vocabulary;

import com.example.com.englishai.backend.application.llm.LlmProviderException;
import com.example.com.englishai.backend.application.llm.LlmResponse;
import com.example.com.englishai.backend.application.llm.LlmResponseFormat;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.application.profile.EnglishLevel;
import com.example.com.englishai.backend.infrastructure.persistence.entity.VocabularyItemEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.VocabularyLessonEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserVocabularyWordEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserProfileJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.VocabularyLessonJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserVocabularyWordJpaRepository;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.jpa.repository.Lock;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class VocabularyServiceTest {
    private final LlmProvider provider = mock(LlmProvider.class);
    private final UserProfileJpaRepository profiles = mock(UserProfileJpaRepository.class);
    private final VocabularyLessonJpaRepository lessons = mock(VocabularyLessonJpaRepository.class);
    private final UserVocabularyWordJpaRepository vocabularyWords = mock(UserVocabularyWordJpaRepository.class);
    private final UserJpaRepository users = mock(UserJpaRepository.class);
    private final VocabularyService service = new VocabularyService(provider, profiles, lessons, vocabularyWords, users);
    private final UUID user = UUID.randomUUID();
    private final Map<String, UserVocabularyWordEntity> permanentWords = new HashMap<>();

    @BeforeEach
    void setup() {
        when(lessons.findByUserIdAndLessonDate(any(), any())).thenReturn(Optional.empty());
        when(lessons.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(profiles.findById(user)).thenReturn(Optional.empty());
        when(users.findByIdForUpdate(any())).thenReturn(Optional.of(mock(UserEntity.class)));
        doAnswer(invocation -> {
            UUID id = invocation.getArgument(0);
            UUID owner = invocation.getArgument(1);
            String word = invocation.getArgument(2);
            String normalized = invocation.getArgument(3);
            OffsetDateTime now = invocation.getArgument(4);
            permanentWords.putIfAbsent(owner + ":" + normalized,
                    new UserVocabularyWordEntity(id, owner, word, normalized, now));
            return null;
        }).when(vocabularyWords).insertIfAbsent(any(), any(), any(), any(), any());
        when(vocabularyWords.findForUpdateByUserIdAndNormalizedWord(any(), any()))
                .thenAnswer(invocation -> Optional.ofNullable(permanentWords.get(
                        invocation.getArgument(0) + ":" + invocation.getArgument(1))));
    }

    @Test
    void generatesAndPersistsExactlyTenWordsUsingEnglishLevel() {
        when(provider.complete(any())).thenReturn(new LlmResponse(generatedWords(10)));

        var lesson = service.today(user);

        assertThat(lesson.words()).hasSize(VocabularyService.VOCABULARY_ITEMS_PER_LESSON);
        assertThat(lesson.words()).allSatisfy(word -> {
            assertThat(word.status()).isEqualTo(VocabularyService.ProgressStatus.NEW);
            assertThat(word.correctCount()).isZero();
            assertThat(word.incorrectCount()).isZero();
        });
        assertThat(lesson.progress()).isEqualTo(new VocabularyService.LessonProgress(false, null, false, null));
        var saved = ArgumentCaptor.forClass(VocabularyLessonEntity.class);
        verify(lessons).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getItems()).hasSize(10);
        verify(provider).complete(org.mockito.ArgumentMatchers.argThat(request ->
                request.responseFormat() == LlmResponseFormat.JSON
                        && request.systemPrompt().contains("exactly 10")
                        && request.systemPrompt().contains("B1")));
    }

    @Test
    void malformedGenerationWithWrongItemCountIsRejected() {
        when(provider.complete(any())).thenReturn(new LlmResponse(generatedWords(9)));

        assertThatThrownBy(() -> service.today(user)).isInstanceOf(LlmProviderException.class);
        verify(lessons, never()).saveAndFlush(any());
    }

    @Test
    void generationTrimsValuesAndRejectsCaseInsensitiveDuplicatesWithinTheLesson() {
        String json = generatedWords(10).replace("\"word\":\"word-2\"", "\"word\":\" WORD-1 \"");
        when(provider.complete(any())).thenReturn(new LlmResponse(json));

        assertThatThrownBy(() -> service.today(user)).isInstanceOf(LlmProviderException.class);
    }

    @Test
    void sameDailyLessonIsReturnedWithoutAnotherLlmCall() {
        var existing = lesson(10);
        when(lessons.findByUserIdAndLessonDate(any(), any())).thenReturn(Optional.of(existing));
        when(lessons.findForUpdateByIdAndUserId(existing.getId(), user)).thenReturn(Optional.of(existing));

        var result = service.today(user);

        assertThat(result.id()).isEqualTo(existing.getId());
        verify(provider, never()).complete(any());
        verify(lessons, never()).saveAndFlush(any());
    }

    @Test
    void legacyFiveWordLessonIsCompletedWithoutReplacingExistingProgress() {
        var existing = lesson(5);
        existing.getItems().get(0).record(true);
        existing.getItems().get(1).record(false);
        existing.completeQuiz(4, OffsetDateTime.now(ZoneOffset.UTC));
        existing.completeWriting(OffsetDateTime.now(ZoneOffset.UTC));
        var originalIds = existing.getItems().stream().map(VocabularyItemEntity::getId).toList();
        when(lessons.findByUserIdAndLessonDate(any(), any())).thenReturn(Optional.of(existing));
        when(lessons.findForUpdateByIdAndUserId(existing.getId(), user)).thenReturn(Optional.of(existing));
        when(provider.complete(any())).thenReturn(new LlmResponse(generatedWordsRange(6, 5)));

        var result = service.today(user);

        assertThat(result.words()).hasSize(10);
        assertThat(result.words().subList(0, 5)).extracting(VocabularyService.Word::id)
                .containsExactlyElementsOf(originalIds);
        assertThat(existing.getItems().get(0).getStatus()).isEqualTo(VocabularyService.ProgressStatus.LEARNING);
        assertThat(existing.getItems().get(0).getCorrectCount()).isEqualTo(1);
        assertThat(existing.getItems().get(1).getIncorrectCount()).isEqualTo(1);
        assertThat(result.progress().quizCompleted()).isTrue();
        assertThat(result.progress().quizScore()).isEqualTo(4);
        assertThat(result.progress().writingCompleted()).isTrue();
        assertThat(result.progress().completedAt()).isNotNull();
        assertThat(result.words()).extracting(VocabularyService.Word::word)
                .doesNotHaveDuplicates();
        verify(provider).complete(org.mockito.ArgumentMatchers.argThat(request ->
                request.systemPrompt().contains("exactly 5")));
    }

    @Test
    void legacyNineWordLessonGeneratesOnlyOneMissingWord() {
        var existing = lesson(9);
        when(lessons.findByUserIdAndLessonDate(any(), any())).thenReturn(Optional.of(existing));
        when(lessons.findForUpdateByIdAndUserId(existing.getId(), user)).thenReturn(Optional.of(existing));
        when(provider.complete(any())).thenReturn(new LlmResponse(generatedWordsRange(10, 1)));

        assertThat(service.today(user).words()).hasSize(10);
        verify(provider).complete(org.mockito.ArgumentMatchers.argThat(request ->
                request.systemPrompt().contains("exactly 1")));
    }

    @Test
    void legacyLessonWithTenWordsDoesNotCallLlm() {
        var existing = lesson(10);
        when(lessons.findByUserIdAndLessonDate(any(), any())).thenReturn(Optional.of(existing));
        when(lessons.findForUpdateByIdAndUserId(existing.getId(), user)).thenReturn(Optional.of(existing));

        assertThat(service.today(user).words()).hasSize(10);
        verify(provider, never()).complete(any());
        verify(lessons, never()).saveAndFlush(any());
    }

    @Test
    void legacyLessonGenerationFailureLeavesExistingWordsUntouched() {
        var existing = lesson(5);
        when(lessons.findByUserIdAndLessonDate(any(), any())).thenReturn(Optional.of(existing));
        when(lessons.findForUpdateByIdAndUserId(existing.getId(), user)).thenReturn(Optional.of(existing));
        when(provider.complete(any())).thenReturn(new LlmResponse(generatedWordsRange(6, 4)));
        var originalIds = existing.getItems().stream().map(VocabularyItemEntity::getId).toList();

        assertThatThrownBy(() -> service.today(user)).isInstanceOf(LlmProviderException.class);

        assertThat(existing.getItems()).hasSize(5);
        assertThat(existing.getItems()).extracting(VocabularyItemEntity::getId).containsExactlyElementsOf(originalIds);
        verify(lessons, never()).saveAndFlush(any());
    }

    @Test
    void concurrentReadsOfTheSameLegacyLessonCannotAddWordsTwice() {
        var existing = lesson(5);
        when(lessons.findByUserIdAndLessonDate(any(), any())).thenReturn(Optional.of(existing));
        when(lessons.findForUpdateByIdAndUserId(existing.getId(), user)).thenAnswer(invocation -> Optional.of(existing));
        when(provider.complete(any())).thenReturn(new LlmResponse(generatedWordsRange(6, 5)));

        service.today(user);
        service.today(user);

        assertThat(existing.getItems()).hasSize(10);
        verify(provider, times(1)).complete(any());
    }

    @Test
    void repeatedWordReusesThePermanentProgressRecordAndItsCounters() {
        var progress = new UserVocabularyWordEntity(UUID.randomUUID(), user, "hungry", "hungry",
                OffsetDateTime.now(ZoneOffset.UTC));
        progress.record(true, OffsetDateTime.now(ZoneOffset.UTC));
        var existing = new VocabularyLessonEntity(UUID.randomUUID(), user, LocalDate.now(), EnglishLevel.B1,
                VocabularyCategory.FOOD, OffsetDateTime.now(ZoneOffset.UTC));
        for (int index = 1; index <= 9; index++) {
            var itemProgress = new UserVocabularyWordEntity(UUID.randomUUID(), user,
                    "word-" + (index + 1), "word-" + (index + 1), OffsetDateTime.now(ZoneOffset.UTC));
            existing.addItem(new VocabularyItemEntity(UUID.randomUUID(), existing, index, "word-" + (index + 1),
                    "tradução", "Example.", "Exemplo.", VocabularyCategory.FOOD, itemProgress));
        }
        when(lessons.findByUserIdAndLessonDate(any(), any())).thenReturn(Optional.of(existing));
        when(lessons.findForUpdateByIdAndUserId(existing.getId(), user)).thenReturn(Optional.of(existing));
        when(provider.complete(any())).thenReturn(new LlmResponse(generatedWordsSpecific("hungry", "com fome", "I am hungry.", "Estou com fome.")));
        when(vocabularyWords.findForUpdateByUserIdAndNormalizedWord(user, "hungry"))
                .thenReturn(Optional.of(progress));
        service.today(user);

        assertThat(existing.getItems()).hasSize(10);
        assertThat(existing.getItems().get(9).getVocabularyWord()).isSameAs(progress);
        assertThat(existing.getItems().get(9).getVocabularyWord()).isSameAs(progress);
        assertThat(existing.getItems().get(9).getStatus()).isEqualTo(VocabularyService.ProgressStatus.LEARNING);
        assertThat(existing.getItems().get(9).getCorrectCount()).isEqualTo(1);
        verify(vocabularyWords).insertIfAbsent(any(), eq(user), eq("hungry"), eq("hungry"), any());
    }

    @Test
    void firstOccurrenceCreatesOnePermanentProgressRecordPerNormalizedWord() {
        Map<String, UserVocabularyWordEntity> progress = new HashMap<>();
        doAnswer(invocation -> {
            UUID id = invocation.getArgument(0);
            UUID owner = invocation.getArgument(1);
            String word = invocation.getArgument(2);
            String normalized = invocation.getArgument(3);
            OffsetDateTime now = invocation.getArgument(4);
            progress.putIfAbsent(normalized, new UserVocabularyWordEntity(id, owner, word, normalized, now));
            return null;
        }).when(vocabularyWords).insertIfAbsent(any(), any(), any(), any(), any());
        when(vocabularyWords.findForUpdateByUserIdAndNormalizedWord(any(), any()))
                .thenAnswer(invocation -> Optional.of(progress.get(invocation.getArgument(1))));
        when(provider.complete(any())).thenReturn(new LlmResponse(generatedWords(10)));
        var result = service.today(user);

        assertThat(result.words()).hasSize(10);
        assertThat(progress).hasSize(10).allSatisfy((normalized, word) ->
                assertThat(word.getStatus()).isEqualTo(VocabularyService.ProgressStatus.NEW));
        verify(vocabularyWords, times(10)).insertIfAbsent(any(), eq(user), any(), any(), any());
    }

    @Test
    void normalizationTrimsCollapsesSpacesAndUsesCaseInsensitiveKeysWithoutChangingWords() {
        assertThat(VocabularyService.normalizeWord("  Hungry   ")).isEqualTo("hungry");
        assertThat(VocabularyService.normalizeWord("running")).isEqualTo("running");
        assertThat(VocabularyService.normalizeWord("running")).isNotEqualTo("run");
    }

    @Test
    void permanentProgressRecordRetainsStatusAndCountersAcrossRecords() {
        var progress = new UserVocabularyWordEntity(UUID.randomUUID(), user, "hungry", "hungry",
                OffsetDateTime.now(ZoneOffset.UTC));
        progress.record(true, OffsetDateTime.now(ZoneOffset.UTC));
        progress.record(false, OffsetDateTime.now(ZoneOffset.UTC));

        assertThat(progress.getStatus()).isEqualTo(VocabularyService.ProgressStatus.LEARNING);
        assertThat(progress.getCorrectCount()).isEqualTo(1);
        assertThat(progress.getIncorrectCount()).isEqualTo(1);
    }

    @Test
    void dailyCreationLocksTheAuthenticatedUserBeforePersistence() {
        when(provider.complete(any())).thenReturn(new LlmResponse(generatedWords(10)));

        service.today(user);

        verify(users).findByIdForUpdate(user);
        verify(lessons).saveAndFlush(any());
    }

    @Test
    void completionWritesUseAPessimisticDatabaseLock() throws Exception {
        Lock lock = VocabularyLessonJpaRepository.class
                .getMethod("findForUpdateByIdAndUserId", UUID.class, UUID.class)
                .getAnnotation(Lock.class);

        assertThat(lock).isNotNull();
        assertThat(lock.value()).isEqualTo(LockModeType.PESSIMISTIC_WRITE);
    }

    @Test
    void quizUsesExactlyFiveOwnedWordsAndPersistsTheComputedScore() {
        var lesson = lesson(10);
        when(lessons.findForUpdateByIdAndUserId(lesson.getId(), user)).thenReturn(Optional.of(lesson));
        var answers = quizAnswers(lesson, 3);

        var result = service.submitQuiz(user, lesson.getId(), answers);

        assertThat(result.score()).isEqualTo(3);
        assertThat(result.total()).isEqualTo(5);
        assertThat(result.progress().quizCompleted()).isTrue();
        assertThat(result.progress().writingCompleted()).isFalse();
        assertThat(result.progress().completedAt()).isNull();
        assertThat(lesson.getQuizScore()).isEqualTo(3);
        assertThat(lesson.getItems().subList(0, 5)).extracting(VocabularyItemEntity::getStatus)
                .containsOnly(VocabularyService.ProgressStatus.LEARNING);
    }

    @Test
    void quizRejectsWrongCountForeignQuestionsAndForeignOwnership() {
        var lesson = lesson(10);
        when(lessons.findForUpdateByIdAndUserId(lesson.getId(), user)).thenReturn(Optional.of(lesson));
        assertThatThrownBy(() -> service.submitQuiz(user, lesson.getId(), quizAnswers(lesson, 5).subList(0, 4)))
                .isInstanceOf(IllegalArgumentException.class);

        var answers = new ArrayList<>(quizAnswers(lesson, 5));
        answers.set(0, new VocabularyService.QuizAnswer(UUID.randomUUID(), lesson.getItems().get(0).getId()));
        assertThatThrownBy(() -> service.submitQuiz(user, lesson.getId(), answers))
                .isInstanceOf(IllegalArgumentException.class);

        assertThatThrownBy(() -> service.submitQuiz(UUID.randomUUID(), lesson.getId(), quizAnswers(lesson, 5)))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void repeatedQuizSubmissionIsIdempotentAndDoesNotChangeScoreOrCounts() {
        var lesson = lesson(10);
        when(lessons.findForUpdateByIdAndUserId(lesson.getId(), user)).thenReturn(Optional.of(lesson));
        var first = service.submitQuiz(user, lesson.getId(), quizAnswers(lesson, 4));
        int firstCorrectCount = lesson.getItems().get(0).getCorrectCount();

        var repeated = service.submitQuiz(user, lesson.getId(), quizAnswers(lesson, 0));

        assertThat(first.score()).isEqualTo(4);
        assertThat(repeated.score()).isEqualTo(4);
        assertThat(lesson.getItems().get(0).getCorrectCount()).isEqualTo(firstCorrectCount);
    }

    @Test
    void writingEvaluationRequiresQuizAndCompletesTheLessonAfterValidFeedback() {
        var lesson = lesson(10);
        var item = lesson.getItems().get(7);
        when(lessons.findForUpdateByIdAndUserId(lesson.getId(), user)).thenReturn(Optional.of(lesson));

        assertThatThrownBy(() -> service.evaluate(user, lesson.getId(), item.getId(), "A sentence."))
                .isInstanceOf(IllegalStateException.class);
        verify(provider, never()).complete(any());

        service.submitQuiz(user, lesson.getId(), quizAnswers(lesson, 5));
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"status\":\"CORRECT\","
                + "\"correctedSentence\":\"It is correct.\",\"explanation\":\"Uso correto.\"}"));
        var result = service.evaluate(user, lesson.getId(), item.getId(), "It is correct.");

        assertThat(result.status()).isEqualTo("CORRECT");
        assertThat(result.progress().writingCompleted()).isTrue();
        assertThat(result.progress().completedAt()).isNotNull();
        assertThat(lesson.getCompletedAt()).isNotNull();
    }

    @Test
    void repeatedWritingEvaluationCannotDuplicateProgress() {
        var lesson = lesson(10);
        var item = lesson.getItems().get(7);
        lesson.completeQuiz(5, OffsetDateTime.now(ZoneOffset.UTC));
        when(lessons.findForUpdateByIdAndUserId(lesson.getId(), user)).thenReturn(Optional.of(lesson));
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"status\":\"CORRECT\",\"explanation\":\"Correto.\"}"));
        service.evaluate(user, lesson.getId(), item.getId(), "It is correct.");

        assertThatThrownBy(() -> service.evaluate(user, lesson.getId(), item.getId(), "It is correct."))
                .isInstanceOf(IllegalStateException.class);
        verify(provider, times(1)).complete(any());
        assertThat(item.getCorrectCount()).isEqualTo(1);
    }

    @Test
    void statusAndCountersAreSharedByOccurrencesOfTheSamePermanentWord() {
        var firstLesson = lesson(1);
        var secondLesson = lesson(1);
        var progress = new UserVocabularyWordEntity(UUID.randomUUID(), user, "word-1", "word-1",
                OffsetDateTime.now(ZoneOffset.UTC));
        var firstOccurrence = new VocabularyItemEntity(UUID.randomUUID(), firstLesson, 1, "word-1",
                "palavra", "Example.", "Exemplo.", VocabularyCategory.FOOD, progress);
        var secondOccurrence = new VocabularyItemEntity(UUID.randomUUID(), secondLesson, 1, " WORD-1 ",
                "palavra", "Example.", "Exemplo.", VocabularyCategory.FOOD, progress);

        assertThat(firstOccurrence.getStatus()).isEqualTo(VocabularyService.ProgressStatus.NEW);
        assertThat(secondOccurrence.getStatus()).isEqualTo(VocabularyService.ProgressStatus.NEW);
        firstOccurrence.record(true);
        assertThat(firstOccurrence.getCorrectCount()).isEqualTo(1);
        assertThat(secondOccurrence.getCorrectCount()).isEqualTo(1);
        assertThat(secondOccurrence.getStatus()).isEqualTo(VocabularyService.ProgressStatus.LEARNING);
    }

    @Test
    void presentingAWordDoesNotCreateReviewEvidence() {
        when(provider.complete(any())).thenReturn(new LlmResponse(generatedWords(10)));

        var result = service.today(user);

        assertThat(result.words()).allSatisfy(word -> {
            assertThat(word.status()).isEqualTo(VocabularyService.ProgressStatus.NEW);
            assertThat(word.correctCount()).isZero();
            assertThat(word.incorrectCount()).isZero();
        });
        assertThat(permanentWords.values()).allSatisfy(word -> {
            assertThat(word.getLastReviewedAt()).isNull();
            assertThat(word.getNextReviewAt()).isNull();
            assertThat(word.getFirstSeenAt()).isNotNull();
            assertThat(word.getLastSeenAt()).isNotNull();
        });
    }

    @Test
    void reappearingNewWordKeepsNewStatusUntilAnAssessedActivity() {
        var progress = new UserVocabularyWordEntity(UUID.randomUUID(), user, "hungry", "hungry",
                OffsetDateTime.now(ZoneOffset.UTC).minusDays(10));
        var existing = lesson(9);
        when(lessons.findByUserIdAndLessonDate(any(), any())).thenReturn(Optional.of(existing));
        when(lessons.findForUpdateByIdAndUserId(existing.getId(), user)).thenReturn(Optional.of(existing));
        when(provider.complete(any())).thenReturn(new LlmResponse(generatedWordsSpecific(
                "Hungry", "com fome", "I am hungry.", "Estou com fome.")));
        when(vocabularyWords.findForUpdateByUserIdAndNormalizedWord(user, "hungry"))
                .thenReturn(Optional.of(progress));

        var result = service.today(user);

        assertThat(result.words().getLast().status()).isEqualTo(VocabularyService.ProgressStatus.NEW);
        assertThat(result.words().getLast().correctCount()).isZero();
        assertThat(result.words().getLast().incorrectCount()).isZero();
        assertThat(progress.getLastReviewedAt()).isNull();
    }

    private VocabularyLessonEntity lesson(int itemCount) {
        var lesson = new VocabularyLessonEntity(UUID.randomUUID(), user, LocalDate.now(), EnglishLevel.B1,
                VocabularyCategory.FOOD, OffsetDateTime.now(ZoneOffset.UTC));
        for (int index = 1; index <= itemCount; index++) {
            var progress = new UserVocabularyWordEntity(UUID.randomUUID(), user, "word-" + index,
                    "word-" + index, OffsetDateTime.now(ZoneOffset.UTC));
            lesson.addItem(new VocabularyItemEntity(UUID.randomUUID(), lesson, index, "word-" + index,
                    "tradução-" + index, "Example " + index + ".", "Exemplo " + index + ".",
                    VocabularyCategory.FOOD, progress));
        }
        return lesson;
    }

    private List<VocabularyService.QuizAnswer> quizAnswers(VocabularyLessonEntity lesson, int correctCount) {
        List<VocabularyService.QuizAnswer> answers = new ArrayList<>();
        for (int index = 0; index < VocabularyService.QUIZ_QUESTION_COUNT; index++) {
            UUID question = lesson.getItems().get(index).getId();
            UUID selected = index < correctCount ? question : lesson.getItems().get((index + 1) % 5).getId();
            answers.add(new VocabularyService.QuizAnswer(question, selected));
        }
        return answers;
    }

    private String generatedWords(int count) {
        return generatedWordsRange(1, count);
    }

    private String generatedWordsRange(int first, int count) {
        StringBuilder json = new StringBuilder("{\"words\":[");
        for (int offset = 0; offset < count; offset++) {
            int index = first + offset;
            if (offset > 0) json.append(',');
            json.append("{\"word\":\"word-").append(index)
                    .append("\",\"translation\":\"tradução-").append(index)
                    .append("\",\"example\":\"Example ").append(index)
                    .append(".\",\"exampleTranslation\":\"Exemplo ").append(index).append(".\"}");
        }
        return json.append("]}").toString();
    }

    private String generatedWordsSpecific(String word, String translation, String example, String exampleTranslation) {
        return "{\"words\":[{\"word\":\"" + word + "\",\"translation\":\"" + translation
                + "\",\"example\":\"" + example + "\",\"exampleTranslation\":\""
                + exampleTranslation + "\"}]}";
    }
}
