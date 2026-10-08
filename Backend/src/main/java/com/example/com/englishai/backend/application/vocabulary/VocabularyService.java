package com.example.com.englishai.backend.application.vocabulary;

import com.example.com.englishai.backend.application.llm.LlmProviderException;
import com.example.com.englishai.backend.application.llm.LlmRequest;
import com.example.com.englishai.backend.application.llm.LlmResponseFormat;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.application.profile.EnglishLevel;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserProfileEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.VocabularyItemEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.VocabularyLessonEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserVocabularyWordEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserProfileJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.VocabularyLessonJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.VocabularyItemJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserVocabularyWordJpaRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.function.Supplier;
import com.example.com.englishai.backend.application.conversation.LocalOperationLocks;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Logger;

public class VocabularyService {
    public static final int VOCABULARY_ITEMS_PER_LESSON = 10;
    public static final int QUIZ_QUESTION_COUNT = 3;
    public static final int MAX_SENTENCE_LENGTH = 1000;
    private static final int RECENT_WORD_LIMIT = 20;
    private static final int MAX_REVIEWS_PER_LESSON = 3;
    private static final int MAX_NEW_WORD_GENERATION_ATTEMPTS = 3;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Logger LOG = Logger.getLogger(VocabularyService.class.getName());

    private final LlmProvider provider;
    private final UserProfileJpaRepository profiles;
    private final VocabularyLessonJpaRepository lessons;
    private final UserVocabularyWordJpaRepository vocabularyWords;
    private final VocabularyItemJpaRepository items;
    private final UserJpaRepository users;
    private final VocabularyReviewScheduler reviewScheduler;
    private final TransactionTemplate writes;
    private final LocalOperationLocks localLocks = new LocalOperationLocks();

    public VocabularyService(LlmProvider provider, UserProfileJpaRepository profiles,
                             VocabularyLessonJpaRepository lessons, UserVocabularyWordJpaRepository vocabularyWords,
                             VocabularyItemJpaRepository items, UserJpaRepository users,
                             VocabularyReviewScheduler reviewScheduler) {
        this(provider, profiles, lessons, vocabularyWords, items, users, reviewScheduler, null);
    }
    public VocabularyService(LlmProvider provider, UserProfileJpaRepository profiles,
                             VocabularyLessonJpaRepository lessons, UserVocabularyWordJpaRepository vocabularyWords,
                             VocabularyItemJpaRepository items, UserJpaRepository users,
                             VocabularyReviewScheduler reviewScheduler, PlatformTransactionManager manager) {
        this.provider = Objects.requireNonNull(provider);
        this.profiles = Objects.requireNonNull(profiles);
        this.lessons = Objects.requireNonNull(lessons);
        this.vocabularyWords = Objects.requireNonNull(vocabularyWords);
        this.items = Objects.requireNonNull(items);
        this.users = Objects.requireNonNull(users);
        this.reviewScheduler = Objects.requireNonNull(reviewScheduler);
        this.writes = manager == null ? null : new TransactionTemplate(manager);
        if (writes != null) writes.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public enum ProgressStatus { NEW, REVIEWING, LEARNED, MASTERED }

    public static String normalizeWord(String word) {
        if (word == null) return null;
        String normalized = word.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
        return normalized.isEmpty() ? null : normalized;
    }

    public record Word(UUID id, String word, String translation, String example, String exampleTranslation,
                       VocabularyCategory category, ProgressStatus status, int correctCount, int incorrectCount,
                       boolean review) {}

    public record LessonProgress(boolean quizCompleted, Integer quizScore, boolean writingCompleted,
                                 OffsetDateTime completedAt) {}

    public record Lesson(UUID id, LocalDate date, EnglishLevel englishLevel, VocabularyCategory category,
                         List<Word> words, LessonProgress progress) {
        public Lesson { words = List.copyOf(words); }
    }

    public record QuizAnswer(UUID wordId, UUID selectedWordId) {}
    public record QuizResult(int score, int total, LessonProgress progress) {}
    public record Evaluation(String status, String correctedSentence, String explanation, String alternative,
                             LessonProgress progress) {}

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Lesson today(UUID userId) {
        return localLocks.run(userId, () -> todayWithoutLongTransaction(userId));
    }

    private record ReviewSource(UUID vocabularyWordId, String word, String translation,
                                String example, String exampleTranslation) {}
    private record TodayPlan(LocalDate date, Lesson existing, UUID legacyId, int missing, List<String> existingWords,
                             EnglishLevel level, VocabularyCategory category, OffsetDateTime now,
                             List<ReviewSource> reviews, List<String> recent) {}

    private Lesson todayWithoutLongTransaction(UUID userId) {
        var plan = shortTransaction(() -> prepareToday(userId));
        if (plan.existing() != null) return plan.existing();
        if (plan.legacyId() != null) {
            var root = parse(complete(prompt(plan.level(), plan.missing()),
                    "Complete the existing vocabulary lesson for category " + plan.category().name()
                            + " and level " + plan.level().name() + ". Generate only " + plan.missing()
                            + " additional entries. Existing lesson words to preserve and never repeat: "
                            + plan.existingWords() + ". Avoid these recently studied words unless needed for meaningful review: "
                            + plan.recent()));
            var generated = parseWords(root, plan.missing(), plan.existingWords().stream()
                    .map(VocabularyService::normalizeWord).filter(Objects::nonNull)
                    .collect(java.util.stream.Collectors.toSet()));
            return shortTransaction(() -> {
                users.findByIdForUpdate(userId).orElseThrow(() -> new NoSuchElementException("User not found"));
                var lesson = lessons.findForUpdateByIdAndUserId(plan.legacyId(), userId)
                        .orElseThrow(() -> new NoSuchElementException("Vocabulary lesson not found"));
                if (lesson.getItems().size() >= VOCABULARY_ITEMS_PER_LESSON) return toLesson(lesson);
                if (lesson.getItems().size() != VOCABULARY_ITEMS_PER_LESSON - plan.missing())
                    throw new IllegalStateException("Vocabulary lesson changed during generation");
                return toLesson(completeLegacyLesson(userId, lesson, generated));
            });
        }
        var reviewWords = plan.reviews().stream().map(source -> normalizeWord(source.word())).filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        var generated = generateNewWords(userId, plan.level(), plan.category(),
                VOCABULARY_ITEMS_PER_LESSON - plan.reviews().size(), plan.recent(), reviewWords);
        return shortTransaction(() -> persistToday(userId, plan, generated));
    }

    private TodayPlan prepareToday(UUID userId) {
        users.findByIdForUpdate(userId).orElseThrow(() -> new NoSuchElementException("User not found"));
        LocalDate date = reviewScheduler.today();
        var existing = lessons.findByUserIdAndLessonDate(userId, date);
        if (existing.isPresent()) {
            var lesson = lessons.findForUpdateByIdAndUserId(existing.get().getId(), userId)
                    .orElseThrow(() -> new NoSuchElementException("Vocabulary lesson disappeared while locking"));
            int itemCount = lesson.getItems().size();
            if (itemCount < VOCABULARY_ITEMS_PER_LESSON) {
                var words = lesson.getItems().stream().map(VocabularyItemEntity::getWord)
                        .filter(Objects::nonNull).toList();
                var recent = lessons.findRecentWords(userId, PageRequest.of(0, RECENT_WORD_LIMIT));
                return new TodayPlan(date, null, lesson.getId(), VOCABULARY_ITEMS_PER_LESSON - itemCount,
                        words, lesson.getEnglishLevel(), lesson.getCategory(), null, List.of(), recent);
            }
            if (itemCount > VOCABULARY_ITEMS_PER_LESSON) {
                LOG.warning("VOCABULARY_LESSON_INVALID_COUNT lesson=" + lesson.getId()
                        + " count=" + itemCount + " expected=" + VOCABULARY_ITEMS_PER_LESSON);
            }
            return new TodayPlan(date, toLesson(lesson), null, 0, List.of(), null, null, null, List.of(), List.of());
        }

        EnglishLevel level = Optional.ofNullable(profiles.findById(userId)
                .map(UserProfileEntity::getEnglishLevel).orElse(null)).orElse(EnglishLevel.B1);
        VocabularyCategory category = VocabularyCategory.values()[Math.floorMod(
                Objects.hash(userId, date), VocabularyCategory.values().length)];
        OffsetDateTime now = reviewScheduler.now();
        var reviews = dueReviewSources(userId, category, now).stream()
                .map(source -> new ReviewSource(source.getVocabularyWord().getId(), source.getWord(),
                        source.getTranslation(), source.getExample(), source.getExampleTranslation())).toList();
        var recent = lessons.findRecentWords(userId, PageRequest.of(0, RECENT_WORD_LIMIT));
        return new TodayPlan(date, null, null, 0, List.of(), level, category, now, reviews, recent);
    }

    private Lesson persistToday(UUID userId, TodayPlan plan, List<Generated> generated) {
        users.findByIdForUpdate(userId).orElseThrow(() -> new NoSuchElementException("User not found"));
        var existing = lessons.findByUserIdAndLessonDate(userId, plan.date());
        if (existing.isPresent()) return toLesson(existing.get());
        var lesson = new VocabularyLessonEntity(UUID.randomUUID(), userId, plan.date(),
                plan.level(), plan.category(), plan.now());
        OffsetDateTime seenAt = lesson.getCreatedAt();
        int position = 1;
        for (var source : plan.reviews()) {
            var vocabularyWord = vocabularyWords.findById(source.vocabularyWordId())
                    .orElseThrow(() -> new IllegalStateException("Vocabulary review word disappeared"));
            lesson.addItem(new VocabularyItemEntity(UUID.randomUUID(), lesson, position++, source.word(),
                    source.translation(), source.example(), source.exampleTranslation(), plan.category(),
                    vocabularyWord, true));
        }
        for (var word : generated) {
            var vocabularyWord = findOrCreateWord(userId, word.word(), seenAt);
            lesson.addItem(new VocabularyItemEntity(UUID.randomUUID(), lesson, position++, word.word(),
                    word.translation(), word.example(), word.exampleTranslation(), plan.category(), vocabularyWord));
        }
        return toLesson(lessons.saveAndFlush(lesson));
    }

    private VocabularyLessonEntity completeLegacyLesson(UUID userId, VocabularyLessonEntity lesson, List<Generated> generated) {
        int nextPosition = lesson.getItems().stream().mapToInt(VocabularyItemEntity::getPosition).max().orElse(0) + 1;
        OffsetDateTime seenAt = reviewScheduler.now();
        for (var word : generated) {
            var vocabularyWord = findOrCreateWord(userId, word.word(), seenAt);
            lesson.addItem(new VocabularyItemEntity(UUID.randomUUID(), lesson, nextPosition++, word.word(),
                    word.translation(), word.example(), word.exampleTranslation(), lesson.getCategory(), vocabularyWord));
        }
        return lessons.saveAndFlush(lesson);
    }

    @Transactional
    public QuizResult submitQuiz(UUID userId, UUID lessonId, List<QuizAnswer> answers) {
        var lesson = requireForUpdate(userId, lessonId);
        if (lesson.isQuizCompleted()) {
            // Keep the historical total for lessons completed before V33,
            // whose persisted score may still reflect the five-question quiz.
            int total = lesson.getQuizScore() != null && lesson.getQuizScore() > QUIZ_QUESTION_COUNT ? 5 : QUIZ_QUESTION_COUNT;
            return new QuizResult(lesson.getQuizScore(), total, progress(lesson));
        }
        if (answers == null || answers.size() != QUIZ_QUESTION_COUNT) {
            throw new IllegalArgumentException("Invalid vocabulary quiz answers");
        }
        var orderedItems = orderedItems(lesson);
        if (orderedItems.size() < QUIZ_QUESTION_COUNT) {
            throw new IllegalStateException("Vocabulary lesson has insufficient quiz items");
        }
        Map<UUID, VocabularyItemEntity> lessonItems = new HashMap<>();
        orderedItems.forEach(item -> lessonItems.put(item.getId(), item));
        Set<UUID> expectedQuestionIds = new HashSet<>();
        orderedItems.stream().limit(QUIZ_QUESTION_COUNT).forEach(item -> expectedQuestionIds.add(item.getId()));
        Set<UUID> receivedQuestionIds = new HashSet<>();
        int score = 0;
        for (QuizAnswer answer : answers) {
            if (answer == null || answer.wordId() == null || answer.selectedWordId() == null
                    || !receivedQuestionIds.add(answer.wordId())
                    || !expectedQuestionIds.contains(answer.wordId())
                    || !lessonItems.containsKey(answer.selectedWordId())) {
                throw new IllegalArgumentException("Invalid vocabulary quiz answers");
            }
            boolean correct = answer.wordId().equals(answer.selectedWordId());
            var item = lessonItems.get(answer.wordId());
            item.record(reviewScheduler.record(item.getStatus(), item.getVocabularyWord().getReviewStage(), correct));
            if (correct) score++;
        }
        if (!receivedQuestionIds.equals(expectedQuestionIds)) {
            throw new IllegalArgumentException("Invalid vocabulary quiz answers");
        }
        lesson.completeQuiz(score, reviewScheduler.now());
        return new QuizResult(score, QUIZ_QUESTION_COUNT, progress(lesson));
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Evaluation evaluate(UUID userId, UUID lessonId, UUID wordId, String sentence) {
        if (sentence == null || sentence.isBlank() || sentence.length() > MAX_SENTENCE_LENGTH) {
            throw new IllegalArgumentException("Invalid sentence");
        }
        return localLocks.run(lessonId, () -> evaluateWithoutLongTransaction(userId, lessonId, wordId, sentence));
    }

    private Evaluation evaluateWithoutLongTransaction(UUID userId, UUID lessonId, UUID wordId, String sentence) {
        String word = shortTransaction(() -> {
            var lesson = requireForUpdate(userId, lessonId);
            if (!lesson.isQuizCompleted()) throw new IllegalStateException("Vocabulary quiz must be completed first");
            if (lesson.isWritingCompleted()) throw new IllegalStateException("Vocabulary writing is already completed");
            return lesson.getItems().stream().filter(value -> value.getId().equals(wordId)).findFirst()
                    .orElseThrow(() -> new NoSuchElementException("Vocabulary word not found")).getWord();
        });
        JsonNode root = parse(complete("Evaluate an English learner sentence using the target word '"
                        + word
                        + "'. Return ONLY JSON with status CORRECT, NEEDS_IMPROVEMENT or INCORRECT, "
                        + "correctedSentence, explanation in Brazilian Portuguese, and optional alternative in English. "
                        + "Evaluate grammar, naturalness and correct word use at the learner level. Do not evaluate Portuguese.",
                "Target word: " + word + "\nSentence: " + sentence));
        String status = string(root, "status");
        if (!Set.of("CORRECT", "NEEDS_IMPROVEMENT", "INCORRECT").contains(status)
                || string(root, "explanation") == null || string(root, "explanation").isBlank()) {
            throw invalidResponse();
        }
        // NEEDS_IMPROVEMENT remains conservative negative evidence, matching the prior counter behavior.
        boolean correct = status.equals("CORRECT");
        return shortTransaction(() -> {
            var lesson = requireForUpdate(userId, lessonId);
            if (!lesson.isQuizCompleted()) throw new IllegalStateException("Vocabulary quiz must be completed first");
            if (lesson.isWritingCompleted()) throw new IllegalStateException("Vocabulary writing is already completed");
            var item = lesson.getItems().stream().filter(value -> value.getId().equals(wordId)).findFirst()
                    .orElseThrow(() -> new NoSuchElementException("Vocabulary word not found"));
            item.record(reviewScheduler.record(item.getStatus(), item.getVocabularyWord().getReviewStage(), correct));
            lesson.completeWriting(reviewScheduler.now());
            return new Evaluation(status, string(root, "correctedSentence"), string(root, "explanation"),
                    string(root, "alternative"), progress(lesson));
        });
    }

    private <T> T shortTransaction(Supplier<T> work) {
        return writes == null ? work.get() : writes.execute(ignored -> work.get());
    }

    private VocabularyLessonEntity requireForUpdate(UUID userId, UUID lessonId) {
        return lessons.findForUpdateByIdAndUserId(lessonId, userId)
                .orElseThrow(() -> new NoSuchElementException("Vocabulary lesson not found"));
    }

    private UserVocabularyWordEntity findOrCreateWord(UUID userId, String word, OffsetDateTime now) {
        String normalized = normalizeWord(word);
        if (normalized == null) throw invalidResponse();
        vocabularyWords.insertIfAbsent(UUID.randomUUID(), userId, word, normalized, now);
        var result = vocabularyWords.findForUpdateByUserIdAndNormalizedWord(userId, normalized)
                .orElseThrow(() -> new IllegalStateException("Vocabulary progress could not be loaded"));
        result.seenAt(now);
        return result;
    }

    private List<VocabularyItemEntity> dueReviewSources(UUID userId, VocabularyCategory category, OffsetDateTime now) {
        var dueWords = vocabularyWords.findDueForReview(userId, category, now, PageRequest.of(0, MAX_REVIEWS_PER_LESSON));
        if (dueWords.isEmpty()) return List.of();
        var sources = items.findRecentSourcesByVocabularyWordIds(userId, category,
                dueWords.stream().map(UserVocabularyWordEntity::getId).toList());
        Map<UUID, VocabularyItemEntity> sourceByWord = new HashMap<>();
        sources.forEach(source -> sourceByWord.putIfAbsent(source.getVocabularyWord().getId(), source));
        return dueWords.stream().limit(MAX_REVIEWS_PER_LESSON).map(word -> sourceByWord.get(word.getId()))
                .filter(Objects::nonNull).toList();
    }

    private List<Generated> generateNewWords(UUID userId, EnglishLevel level, VocabularyCategory category, int expectedCount,
                                             List<String> recent, Set<String> excludedWords) {
        if (expectedCount == 0) return List.of();
        var accepted = new ArrayList<Generated>();
        var excluded = new HashSet<>(excludedWords);
        for (int attempt = 0; attempt < MAX_NEW_WORD_GENERATION_ATTEMPTS && accepted.size() < expectedCount; attempt++) {
            int remaining = expectedCount - accepted.size();
            JsonNode root = parse(complete(prompt(level, remaining), "Generate exactly " + remaining
                    + " new entries for category " + category.name() + " and level " + level.name()
                    + ". Avoid these recently studied words: " + recent
                    + ". Never use these words because they are already selected or known: " + excluded));
            // Parse and validate the provider payload first. Known words are
            // filtered below so a collision can be retried without treating
            // an otherwise valid response as malformed.
            var candidates = parseWords(root, remaining, Set.of());
            var normalized = candidates.stream().map(value -> normalizeWord(value.word())).toList();
            var known = new HashSet<>(vocabularyWords.findExistingNormalizedWords(userId, normalized));
            for (var candidate : candidates) {
                String key = normalizeWord(candidate.word());
                if (excluded.add(key) && !known.contains(key)) accepted.add(candidate);
            }
        }
        if (accepted.size() != expectedCount) throw invalidResponse();
        return accepted;
    }

    private String prompt(EnglishLevel level, int itemCount) {
        return "Create exactly " + itemCount
                + " distinct English vocabulary entries for a Brazilian learner at " + level
                + ". Return ONLY JSON {\"words\":[{\"word\":\"...\",\"translation\":\"...\","
                + "\"example\":\"English sentence...\",\"exampleTranslation\":\"Portuguese translation...\"}]}. "
                + "English is always the language studied; Portuguese is support only. Adapt word difficulty and examples to "
                + level + ". No HTML or Markdown.";
    }

    private String complete(String system, String user) {
        var response = provider.complete(new LlmRequest(system, user, null, LlmResponseFormat.JSON));
        if (response == null || response.content() == null) throw invalidResponse();
        return response.content();
    }

    private record Generated(String word, String translation, String example, String exampleTranslation) {}

    private List<Generated> parseWords(JsonNode root, int expectedCount, Set<String> existingWords) {
        JsonNode values = root.path("words");
        if (!values.isArray() || values.size() != expectedCount) throw invalidResponse();
        var result = new ArrayList<Generated>();
        var seen = new HashSet<String>();
        for (JsonNode item : values) {
            String word = clean(string(item, "word"));
            String translation = clean(string(item, "translation"));
            String example = clean(string(item, "example"));
            String exampleTranslation = clean(string(item, "exampleTranslation"));
            if (word == null || word.length() > 120 || translation == null || translation.length() > 200
                    || example == null || example.length() > 500 || exampleTranslation == null
                    || exampleTranslation.length() > 600 || !seen.add(normalizeWord(word))
                    || existingWords.contains(normalizeWord(word))) {
                throw invalidResponse();
            }
            result.add(new Generated(word, translation, example, exampleTranslation));
        }
        return result;
    }

    private List<VocabularyItemEntity> orderedItems(VocabularyLessonEntity entity) {
        return entity.getItems().stream().sorted(Comparator.comparingInt(VocabularyItemEntity::getPosition)).toList();
    }

    private Lesson toLesson(VocabularyLessonEntity entity) {
        return new Lesson(entity.getId(), entity.getLessonDate(), entity.getEnglishLevel(), entity.getCategory(),
                orderedItems(entity).stream().map(item -> new Word(item.getId(), item.getWord(), item.getTranslation(),
                        item.getExample(), item.getExampleTranslation(), item.getCategory(), item.getStatus(),
                        item.getCorrectCount(), item.getIncorrectCount(), item.isReviewItem())).toList(), progress(entity));
    }

    private LessonProgress progress(VocabularyLessonEntity entity) {
        return new LessonProgress(entity.isQuizCompleted(), entity.getQuizScore(), entity.isWritingCompleted(),
                entity.getCompletedAt());
    }

    private static JsonNode parse(String raw) {
        try {
            String value = raw.strip();
            if (value.startsWith("```")) {
                value = value.substring(value.indexOf('\n') + 1, value.lastIndexOf("```")).strip();
            }
            JsonNode root = JSON.readTree(value);
            if (root == null || !root.isObject()) throw invalidResponse();
            return root;
        } catch (Exception exception) {
            throw invalidResponse();
        }
    }

    private static String clean(String value) {
        if (value == null) return null;
        String cleaned = value.strip();
        return cleaned.isEmpty() ? null : cleaned;
    }

    private static String string(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isTextual() ? value.textValue() : null;
    }

    private static LlmProviderException invalidResponse() {
        return new LlmProviderException("Invalid vocabulary response");
    }
}
