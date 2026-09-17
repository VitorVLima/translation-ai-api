package com.example.com.englishai.backend.integration.vocabulary;

import com.example.com.englishai.backend.application.llm.LlmRequest;
import com.example.com.englishai.backend.application.llm.LlmResponse;
import com.example.com.englishai.backend.application.llm.LlmProviderException;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.application.vocabulary.VocabularyService;
import com.example.com.englishai.backend.application.vocabulary.VocabularyReviewScheduler;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserVocabularyWordEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.VocabularyItemEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.VocabularyLessonEntity;
import com.example.com.englishai.backend.application.profile.EnglishLevel;
import com.example.com.englishai.backend.application.vocabulary.VocabularyCategory;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserProfileJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserVocabularyWordJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.VocabularyLessonJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.VocabularyItemJpaRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest
class VocabularyPersistenceIntegrationTest {
    @Autowired UserJpaRepository users;
    @Autowired UserProfileJpaRepository profiles;
    @Autowired VocabularyLessonJpaRepository lessons;
    @Autowired UserVocabularyWordJpaRepository vocabularyWords;
    @Autowired VocabularyItemJpaRepository vocabularyItems;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;
    @Autowired VocabularyService configuredService;

    private final LlmProvider provider = mock(LlmProvider.class);
    private final List<UUID> owners = new ArrayList<>();
    private TransactionTemplate transactions;
    private VocabularyService service;

    @BeforeEach
    void setup() {
        cleanupOwners(jdbc.queryForList("select id from users where email like 'vocabulary-%@test.com'", UUID.class));
        reset(provider);
        transactions = new TransactionTemplate(transactionManager);
        service = new VocabularyService(provider, profiles, lessons, vocabularyWords, vocabularyItems, users,
                new VocabularyReviewScheduler(java.time.Clock.systemUTC()));
        when(provider.complete(any())).thenAnswer(invocation -> {
            LlmRequest request = invocation.getArgument(0);
            if (request.systemPrompt().startsWith("Evaluate an English learner sentence")) {
                return new LlmResponse("{\"status\":\"CORRECT\",\"explanation\":\"Uso correto.\"}");
            }
            if (request.userPrompt().startsWith("Complete the existing")) return new LlmResponse(generatedWordsRange(6, 5));
            var matcher = java.util.regex.Pattern.compile("Create exactly (\\d+)").matcher(request.systemPrompt());
            if (matcher.find()) return new LlmResponse(generatedWords(Integer.parseInt(matcher.group(1))));
            return new LlmResponse(generatedWords(10));
        });
    }

    @AfterEach
    void cleanup() {
        cleanupOwners(owners);
    }

    private void cleanupOwners(List<UUID> userIds) {
        userIds.forEach(id -> {
            jdbc.update("delete from vocabulary_items where lesson_id in "
                    + "(select id from vocabulary_lessons where user_id = ?)", id);
            jdbc.update("delete from vocabulary_lessons where user_id = ?", id);
            jdbc.update("delete from user_vocabulary_words where user_id = ?", id);
            jdbc.update("delete from users where id = ?", id);
        });
    }

    @Test
    void applicationServiceIsConfiguredWithThePermanentProgressRepository() {
        assertThat(ReflectionTestUtils.getField(configuredService, "vocabularyWords")).isSameAs(vocabularyWords);
    }

    @Test
    void firstAccessForDifferentUsersCreatesIndependentLessonsAndValidForeignKeys() {
        UUID userA = owner("a");
        UUID userB = owner("b");

        var lessonA = tx(() -> service.today(userA));
        var lessonB = tx(() -> service.today(userB));

        assertThat(lessonA.id()).isNotEqualTo(lessonB.id());
        assertThat(lessonA.words()).hasSize(10).allMatch(word -> word.status() == VocabularyService.ProgressStatus.NEW);
        assertThat(lessonB.words()).hasSize(10).allMatch(word -> word.status() == VocabularyService.ProgressStatus.NEW);
        assertThat(new HashSet<>(lessonA.words().stream().map(VocabularyService.Word::id).toList()))
                .doesNotContainAnyElementsOf(lessonB.words().stream().map(VocabularyService.Word::id).toList());
        assertThat(count("select count(*) from user_vocabulary_words where user_id = ?", userA)).isEqualTo(10);
        assertThat(count("select count(*) from user_vocabulary_words where user_id = ?", userB)).isEqualTo(10);
        assertThat(count("select count(*) from vocabulary_items i left join user_vocabulary_words w "
                + "on w.id=i.vocabulary_word_id where w.id is null")).isZero();
        assertThat(count("select count(*) from vocabulary_items i join vocabulary_lessons l on l.id=i.lesson_id "
                + "join user_vocabulary_words w on w.id=i.vocabulary_word_id where l.user_id<>w.user_id")).isZero();
    }

    @Test
    void accountCompletionAndPermanentProgressNeverLeakToAnotherUser() {
        UUID userA = owner("completed-a");
        UUID userB = owner("fresh-b");
        var lessonA = tx(() -> service.today(userA));
        var answers = lessonA.words().stream().limit(5)
                .map(word -> new VocabularyService.QuizAnswer(word.id(), word.id())).toList();

        tx(() -> service.submitQuiz(userA, lessonA.id(), answers));
        tx(() -> service.evaluate(userA, lessonA.id(), lessonA.words().get(5).id(), "I use word-6 correctly."));
        var lessonB = tx(() -> service.today(userB));

        assertThat(lessonB.progress()).isEqualTo(new VocabularyService.LessonProgress(false, null, false, null));
        assertThat(lessonB.words()).allMatch(word -> word.status() == VocabularyService.ProgressStatus.NEW
                && word.correctCount() == 0 && word.incorrectCount() == 0);
        assertThatThrownBy(() -> tx(() -> service.submitQuiz(userB, lessonA.id(), answers)))
                .isInstanceOf(NoSuchElementException.class);
        assertThatThrownBy(() -> tx(() -> service.evaluate(userB, lessonA.id(), lessonA.words().get(5).id(), "A sentence.")))
                .isInstanceOf(NoSuchElementException.class);

        var restoredA = tx(() -> service.today(userA));
        assertThat(restoredA.progress().quizCompleted()).isTrue();
        assertThat(restoredA.progress().quizScore()).isEqualTo(5);
        assertThat(restoredA.progress().writingCompleted()).isTrue();
        assertThat(restoredA.progress().completedAt()).isNotNull();
        assertThat(restoredA.words().get(5).correctCount()).isEqualTo(1);
    }

    @Test
    void concurrentFirstAccessCreatesOneLessonWithTenNonOrphanItems() throws Exception {
        UUID user = owner("concurrent");
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<VocabularyService.Lesson> create = () -> tx(() -> service.today(user));
            var first = executor.submit(create);
            var second = executor.submit(create);
            var results = List.of(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS));

            assertThat(results).extracting(VocabularyService.Lesson::id).containsOnly(results.getFirst().id());
        }
        assertThat(count("select count(*) from vocabulary_lessons where user_id = ?", user)).isEqualTo(1);
        assertThat(count("select count(*) from vocabulary_items i join vocabulary_lessons l on l.id=i.lesson_id "
                + "where l.user_id = ?", user)).isEqualTo(10);
        assertThat(count("select count(*) from user_vocabulary_words where user_id = ?", user)).isEqualTo(10);
        assertThat(count("select count(*) from vocabulary_items i join vocabulary_lessons l on l.id=i.lesson_id "
                + "left join user_vocabulary_words w on w.id=i.vocabulary_word_id where l.user_id=? and w.id is null", user)).isZero();
        verify(provider, times(1)).complete(any());
    }

    @Test
    void legacyFiveWordLessonIsCompletedWithoutReplacingExistingRows() {
        UUID user = owner("legacy");
        List<UUID> originalIds = tx(() -> {
            OffsetDateTime now = OffsetDateTime.now();
            var lesson = new VocabularyLessonEntity(UUID.randomUUID(), user, java.time.LocalDate.now(java.time.ZoneOffset.UTC),
                    EnglishLevel.B1, VocabularyCategory.FOOD, now);
            for (int index = 1; index <= 5; index++) {
                var progress = vocabularyWords.save(new UserVocabularyWordEntity(UUID.randomUUID(), user,
                        "word-" + index, "word-" + index, now));
                if (index == 1) progress.record(new VocabularyReviewScheduler(Clock.fixed(now.toInstant(), now.getOffset()))
                        .record(progress.getStatus(), progress.getReviewStage(), true));
                lesson.addItem(new VocabularyItemEntity(UUID.randomUUID(), lesson, index, "word-" + index,
                        "tradução-" + index, "Example " + index + ".", "Exemplo " + index + ".",
                        VocabularyCategory.FOOD, progress));
            }
            return lessons.saveAndFlush(lesson).getItems().stream().map(VocabularyItemEntity::getId).toList();
        });

        var completed = tx(() -> service.today(user));

        assertThat(completed.words()).hasSize(10);
        assertThat(completed.words().subList(0, 5)).extracting(VocabularyService.Word::id)
                .containsExactlyElementsOf(originalIds);
        assertThat(completed.words().getFirst().correctCount()).isEqualTo(1);
        assertThat(count("select count(*) from vocabulary_items i join vocabulary_lessons l on l.id=i.lesson_id "
                + "where l.user_id=?", user)).isEqualTo(10);
        assertThat(count("select count(*) from vocabulary_items i join vocabulary_lessons l on l.id=i.lesson_id "
                + "left join user_vocabulary_words w on w.id=i.vocabulary_word_id where l.user_id=? and w.id is null", user)).isZero();
    }

    @Test
    void invalidGenerationRollsBackWithoutLeavingLessonWordsOrItems() {
        UUID user = owner("rollback");
        doReturn(new LlmResponse(generatedWords(9))).when(provider).complete(any());

        assertThatThrownBy(() -> tx(() -> service.today(user))).isInstanceOf(LlmProviderException.class);

        assertThat(count("select count(*) from vocabulary_lessons where user_id=?", user)).isZero();
        assertThat(count("select count(*) from user_vocabulary_words where user_id=?", user)).isZero();
        assertThat(count("select count(*) from vocabulary_items i join vocabulary_lessons l on l.id=i.lesson_id "
                + "where l.user_id=?", user)).isZero();
    }

    @Test
    void dueWordIsReusedAsAReviewAndOnlyTheMissingNewWordsAreGenerated() {
        UUID user = owner("review");
        VocabularyCategory category = VocabularyCategory.values()[Math.floorMod(
                java.util.Objects.hash(user, java.time.LocalDate.now(java.time.ZoneOffset.UTC)),
                VocabularyCategory.values().length)];
        tx(() -> {
            OffsetDateTime now = OffsetDateTime.now(java.time.ZoneOffset.UTC).minusDays(3);
            var progress = vocabularyWords.save(new UserVocabularyWordEntity(UUID.randomUUID(), user,
                    "reviewed", "reviewed", now));
            var historical = new VocabularyLessonEntity(UUID.randomUUID(), user,
                    java.time.LocalDate.now(java.time.ZoneOffset.UTC).minusDays(2), EnglishLevel.B1, category, now);
            historical.addItem(new VocabularyItemEntity(UUID.randomUUID(), historical, 1, "reviewed",
                    "revisado", "A reviewed example.", "Um exemplo.", category, progress));
            lessons.saveAndFlush(historical);
            jdbc.update("update user_vocabulary_words set status='REVIEWING', review_stage=2, "
                    + "last_reviewed_at=?, next_review_at=? where id=?", now, OffsetDateTime.now(java.time.ZoneOffset.UTC).minusHours(1), progress.getId());
            return null;
        });

        var lesson = tx(() -> service.today(user));

        assertThat(lesson.words()).hasSize(10);
        assertThat(lesson.words().getFirst().review()).isTrue();
        assertThat(lesson.words().getFirst().word()).isEqualTo("reviewed");
        assertThat(lesson.words()).filteredOn(word -> !word.review()).hasSize(9);
        assertThat(count("select count(*) from user_vocabulary_words where user_id=?", user)).isEqualTo(10);
        org.mockito.Mockito.verify(provider).complete(org.mockito.ArgumentMatchers.argThat(request ->
                request.systemPrompt().contains("Create exactly 9")));
    }

    private UUID owner(String label) {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        users.saveAndFlush(new UserEntity(id, "vocabulary-" + label + "-" + id + "@test.com",
                "vocabulary-" + label + "-" + id.toString().substring(0, 8), "test-hash", now, now, false));
        owners.add(id);
        return id;
    }

    private <T> T tx(Supplier<T> work) {
        return transactions.execute(status -> work.get());
    }

    private long count(String sql, Object... parameters) {
        return jdbc.queryForObject(sql, Long.class, parameters);
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
}
