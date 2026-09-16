package com.example.com.englishai.backend.infrastructure.persistence.entity;

import com.example.com.englishai.backend.application.vocabulary.VocabularyService;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "user_vocabulary_words",
        uniqueConstraints = @UniqueConstraint(name = "uk_user_vocabulary_word", columnNames = {"user_id", "normalized_word"}))
public class UserVocabularyWordEntity {
    @Id
    private UUID id;
    @Column(name = "user_id", nullable = false)
    private UUID userId;
    @Column(nullable = false, length = 120)
    private String word;
    @Column(name = "normalized_word", nullable = false, length = 120)
    private String normalizedWord;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private VocabularyService.ProgressStatus status;
    @Column(name = "correct_count", nullable = false)
    private int correctCount;
    @Column(name = "incorrect_count", nullable = false)
    private int incorrectCount;
    @Column(name = "first_seen_at", nullable = false)
    private OffsetDateTime firstSeenAt;
    @Column(name = "last_seen_at", nullable = false)
    private OffsetDateTime lastSeenAt;
    @Column(name = "last_reviewed_at")
    private OffsetDateTime lastReviewedAt;
    @Column(name = "next_review_at")
    private OffsetDateTime nextReviewAt;
    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected UserVocabularyWordEntity() {}

    public UserVocabularyWordEntity(UUID id, UUID userId, String word, String normalizedWord, OffsetDateTime now) {
        this.id = id;
        this.userId = userId;
        this.word = word;
        this.normalizedWord = normalizedWord;
        this.status = VocabularyService.ProgressStatus.NEW;
        this.firstSeenAt = now;
        this.lastSeenAt = now;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void seenAt(OffsetDateTime now) {
        lastSeenAt = now;
        updatedAt = now;
    }

    public void record(boolean correct, OffsetDateTime now) {
        if (correct) {
            correctCount++;
            if (correctCount >= 2) status = VocabularyService.ProgressStatus.REVIEWING;
            else status = VocabularyService.ProgressStatus.LEARNING;
        } else {
            incorrectCount++;
            status = VocabularyService.ProgressStatus.LEARNING;
        }
        lastReviewedAt = now;
        updatedAt = now;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getWord() { return word; }
    public String getNormalizedWord() { return normalizedWord; }
    public VocabularyService.ProgressStatus getStatus() { return status; }
    public int getCorrectCount() { return correctCount; }
    public int getIncorrectCount() { return incorrectCount; }
    public OffsetDateTime getFirstSeenAt() { return firstSeenAt; }
    public OffsetDateTime getLastSeenAt() { return lastSeenAt; }
    public OffsetDateTime getLastReviewedAt() { return lastReviewedAt; }
    public OffsetDateTime getNextReviewAt() { return nextReviewAt; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
