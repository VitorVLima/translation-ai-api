package com.example.com.englishai.backend.infrastructure.persistence.entity;

import com.example.com.englishai.backend.application.profile.EnglishLevel;
import com.example.com.englishai.backend.application.vocabulary.VocabularyCategory;
import com.example.com.englishai.backend.application.vocabulary.VocabularyService;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "vocabulary_lessons", uniqueConstraints = @UniqueConstraint(name = "uk_vocabulary_user_day", columnNames = {"user_id", "lesson_date"}))
public class VocabularyLessonEntity {
    @Id
    private UUID id;
    @Column(name = "user_id", nullable = false)
    private UUID userId;
    @Column(name = "lesson_date", nullable = false)
    private LocalDate lessonDate;
    @Enumerated(EnumType.STRING)
    @Column(name = "english_level", nullable = false, length = 2)
    private EnglishLevel englishLevel;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private VocabularyCategory category;
    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;
    @Column(name = "quiz_completed", nullable = false)
    private boolean quizCompleted;
    @Column(name = "quiz_score")
    private Short quizScore;
    @Column(name = "writing_completed", nullable = false)
    private boolean writingCompleted;
    @Column(name = "completed_at")
    private OffsetDateTime completedAt;
    @OneToMany(mappedBy = "lesson", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    private List<VocabularyItemEntity> items = new ArrayList<>();

    protected VocabularyLessonEntity() {}

    public VocabularyLessonEntity(UUID id, UUID userId, LocalDate date, EnglishLevel level,
                                  VocabularyCategory category, OffsetDateTime now) {
        this.id = id;
        this.userId = userId;
        this.lessonDate = date;
        this.englishLevel = level;
        this.category = category;
        this.createdAt = now;
    }

    public void addItem(VocabularyItemEntity item) {
        items.add(item);
    }

    public void completeQuiz(int score, OffsetDateTime now) {
        if (quizCompleted) return;
        if (score < 0 || score > VocabularyService.QUIZ_QUESTION_COUNT) {
            throw new IllegalArgumentException("Invalid vocabulary quiz score");
        }
        quizCompleted = true;
        quizScore = (short) score;
        completeIfReady(now);
    }

    public void completeWriting(OffsetDateTime now) {
        if (writingCompleted) return;
        if (!quizCompleted) throw new IllegalStateException("Vocabulary quiz must be completed first");
        writingCompleted = true;
        completeIfReady(now);
    }

    private void completeIfReady(OffsetDateTime now) {
        if (quizCompleted && writingCompleted && completedAt == null) completedAt = now;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public LocalDate getLessonDate() { return lessonDate; }
    public EnglishLevel getEnglishLevel() { return englishLevel; }
    public VocabularyCategory getCategory() { return category; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public boolean isQuizCompleted() { return quizCompleted; }
    public Integer getQuizScore() { return quizScore == null ? null : quizScore.intValue(); }
    public boolean isWritingCompleted() { return writingCompleted; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public List<VocabularyItemEntity> getItems() { return items; }
}
