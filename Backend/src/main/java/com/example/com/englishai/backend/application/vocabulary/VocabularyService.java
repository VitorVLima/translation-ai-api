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
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserVocabularyWordJpaRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
    public static final int QUIZ_QUESTION_COUNT = 5;
    public static final int MAX_SENTENCE_LENGTH = 1000;
    private static final int RECENT_WORD_LIMIT = 20;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Logger LOG = Logger.getLogger(VocabularyService.class.getName());

    private final LlmProvider provider;
    private final UserProfileJpaRepository profiles;
    private final VocabularyLessonJpaRepository lessons;
    private final UserVocabularyWordJpaRepository vocabularyWords;
    private final UserJpaRepository users;

    public VocabularyService(LlmProvider provider, UserProfileJpaRepository profiles,
                             VocabularyLessonJpaRepository lessons, UserVocabularyWordJpaRepository vocabularyWords,
                             UserJpaRepository users) {
        this.provider = Objects.requireNonNull(provider);
        this.profiles = Objects.requireNonNull(profiles);
        this.lessons = Objects.requireNonNull(lessons);
        this.vocabularyWords = Objects.requireNonNull(vocabularyWords);
        this.users = Objects.requireNonNull(users);
    }

    public enum ProgressStatus { NEW, LEARNING, REVIEWING, MASTERED }

    public static String normalizeWord(String word) {
        if (word == null) return null;
        String normalized = word.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
        return normalized.isEmpty() ? null : normalized;
    }

    public record Word(UUID id, String word, String translation, String example, String exampleTranslation,
                       VocabularyCategory category, ProgressStatus status, int correctCount, int incorrectCount) {}

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

    @Transactional
    public Lesson today(UUID userId) {
        users.findByIdForUpdate(userId)
                .orElseThrow(() -> new NoSuchElementException("User not found"));
        LocalDate date = LocalDate.now(ZoneOffset.UTC);
        var existing = lessons.findByUserIdAndLessonDate(userId, date);
        if (existing.isPresent()) {
            var lesson = lessons.findForUpdateByIdAndUserId(existing.get().getId(), userId)
                    .orElseThrow(() -> new NoSuchElementException("Vocabulary lesson disappeared while locking"));
            int itemCount = lesson.getItems().size();
            if (itemCount < VOCABULARY_ITEMS_PER_LESSON) {
                return toLesson(completeLegacyLesson(userId, lesson, itemCount));
            }
            if (itemCount > VOCABULARY_ITEMS_PER_LESSON) {
                LOG.warning("VOCABULARY_LESSON_INVALID_COUNT lesson=" + lesson.getId()
                        + " count=" + itemCount + " expected=" + VOCABULARY_ITEMS_PER_LESSON);
            }
            return toLesson(lesson);
        }

        EnglishLevel level = Optional.ofNullable(profiles.findById(userId)
                .map(UserProfileEntity::getEnglishLevel).orElse(null)).orElse(EnglishLevel.B1);
        VocabularyCategory category = VocabularyCategory.values()[Math.floorMod(
                Objects.hash(userId, date), VocabularyCategory.values().length)];
        var recent = lessons.findRecentWords(userId, PageRequest.of(0, RECENT_WORD_LIMIT));
        JsonNode root = parse(complete(prompt(level, VOCABULARY_ITEMS_PER_LESSON), "Generate a lesson for category " + category.name()
                + " and level " + level.name()
                + ". Avoid these recently studied words unless needed for meaningful review: " + recent));
        var generated = parseWords(root, VOCABULARY_ITEMS_PER_LESSON, Set.of());
        var lesson = new VocabularyLessonEntity(UUID.randomUUID(), userId, date, level, category,
                OffsetDateTime.now(ZoneOffset.UTC));
        OffsetDateTime seenAt = lesson.getCreatedAt();
        for (int i = 0; i < generated.size(); i++) {
            var word = generated.get(i);
            var vocabularyWord = findOrCreateWord(userId, word.word(), seenAt);
            lesson.addItem(new VocabularyItemEntity(UUID.randomUUID(), lesson, i + 1, word.word(),
                    word.translation(), word.example(), word.exampleTranslation(), category, vocabularyWord));
        }
        return toLesson(lessons.saveAndFlush(lesson));
    }

    private VocabularyLessonEntity completeLegacyLesson(UUID userId, VocabularyLessonEntity lesson, int itemCount) {
        int missing = VOCABULARY_ITEMS_PER_LESSON - itemCount;
        var existingWords = lesson.getItems().stream().map(VocabularyItemEntity::getWord)
                .filter(Objects::nonNull).toList();
        var recent = lessons.findRecentWords(userId, PageRequest.of(0, RECENT_WORD_LIMIT));
        JsonNode root = parse(complete(prompt(lesson.getEnglishLevel(), missing),
                "Complete the existing vocabulary lesson for category " + lesson.getCategory().name()
                        + " and level " + lesson.getEnglishLevel().name() + ". Generate only " + missing
                        + " additional entries. Existing lesson words to preserve and never repeat: "
                        + existingWords + ". Avoid these recently studied words unless needed for meaningful review: " + recent));
        var generated = parseWords(root, missing, existingWords.stream()
                .filter(Objects::nonNull).map(value -> value.strip().toLowerCase(Locale.ROOT))
                .collect(java.util.stream.Collectors.toSet()));
        int nextPosition = lesson.getItems().stream().mapToInt(VocabularyItemEntity::getPosition).max().orElse(0) + 1;
        OffsetDateTime seenAt = OffsetDateTime.now(ZoneOffset.UTC);
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
            return new QuizResult(lesson.getQuizScore(), QUIZ_QUESTION_COUNT, progress(lesson));
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
            lessonItems.get(answer.wordId()).record(correct, OffsetDateTime.now(ZoneOffset.UTC));
            if (correct) score++;
        }
        if (!receivedQuestionIds.equals(expectedQuestionIds)) {
            throw new IllegalArgumentException("Invalid vocabulary quiz answers");
        }
        lesson.completeQuiz(score, OffsetDateTime.now(ZoneOffset.UTC));
        return new QuizResult(score, QUIZ_QUESTION_COUNT, progress(lesson));
    }

    @Transactional
    public Evaluation evaluate(UUID userId, UUID lessonId, UUID wordId, String sentence) {
        if (sentence == null || sentence.isBlank() || sentence.length() > MAX_SENTENCE_LENGTH) {
            throw new IllegalArgumentException("Invalid sentence");
        }
        var lesson = requireForUpdate(userId, lessonId);
        if (!lesson.isQuizCompleted()) throw new IllegalStateException("Vocabulary quiz must be completed first");
        if (lesson.isWritingCompleted()) throw new IllegalStateException("Vocabulary writing is already completed");
        var item = lesson.getItems().stream().filter(value -> value.getId().equals(wordId)).findFirst()
                .orElseThrow(() -> new NoSuchElementException("Vocabulary word not found"));
        JsonNode root = parse(complete("Evaluate an English learner sentence using the target word '"
                        + item.getWord()
                        + "'. Return ONLY JSON with status CORRECT, NEEDS_IMPROVEMENT or INCORRECT, "
                        + "correctedSentence, explanation in Brazilian Portuguese, and optional alternative in English. "
                        + "Evaluate grammar, naturalness and correct word use at the learner level. Do not evaluate Portuguese.",
                "Target word: " + item.getWord() + "\nSentence: " + sentence));
        String status = string(root, "status");
        if (!Set.of("CORRECT", "NEEDS_IMPROVEMENT", "INCORRECT").contains(status)
                || string(root, "explanation") == null || string(root, "explanation").isBlank()) {
            throw invalidResponse();
        }
        item.record(status.equals("CORRECT"), OffsetDateTime.now(ZoneOffset.UTC));
        lesson.completeWriting(OffsetDateTime.now(ZoneOffset.UTC));
        return new Evaluation(status, string(root, "correctedSentence"), string(root, "explanation"),
                string(root, "alternative"), progress(lesson));
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
                    || exampleTranslation.length() > 600 || !seen.add(word.toLowerCase(Locale.ROOT))
                    || existingWords.contains(word.toLowerCase(Locale.ROOT))) {
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
                        item.getCorrectCount(), item.getIncorrectCount())).toList(), progress(entity));
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
