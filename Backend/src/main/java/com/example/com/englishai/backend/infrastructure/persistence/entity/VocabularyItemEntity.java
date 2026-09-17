package com.example.com.englishai.backend.infrastructure.persistence.entity;

import com.example.com.englishai.backend.application.vocabulary.VocabularyCategory;
import com.example.com.englishai.backend.application.vocabulary.VocabularyService;
import com.example.com.englishai.backend.application.vocabulary.VocabularyReviewScheduler;
import jakarta.persistence.*;

import java.util.UUID;

@Entity
@Table(name = "vocabulary_items",
        uniqueConstraints = @UniqueConstraint(name = "uk_vocabulary_lesson_position", columnNames = {"lesson_id", "position"}))
public class VocabularyItemEntity {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "lesson_id") private VocabularyLessonEntity lesson;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "vocabulary_word_id") private UserVocabularyWordEntity vocabularyWord;
    @Column(nullable = false) private int position;
    @Column(nullable = false, length = 120) private String word;
    @Column(nullable = false, length = 200) private String translation;
    @Column(nullable = false, length = 500) private String example;
    @Column(name = "example_translation", nullable = false, length = 600) private String exampleTranslation;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) private VocabularyCategory category;
    @Column(name = "review_item", nullable = false) private boolean reviewItem;

    protected VocabularyItemEntity() {}

    public VocabularyItemEntity(UUID id, VocabularyLessonEntity lesson, int position, String word, String translation,
                                String example, String exampleTranslation, VocabularyCategory category,
                                UserVocabularyWordEntity vocabularyWord) {
        this(id, lesson, position, word, translation, example, exampleTranslation, category, vocabularyWord, false);
    }

    public VocabularyItemEntity(UUID id, VocabularyLessonEntity lesson, int position, String word, String translation,
                                String example, String exampleTranslation, VocabularyCategory category,
                                UserVocabularyWordEntity vocabularyWord, boolean reviewItem) {
        this.id = id;
        this.lesson = lesson;
        this.position = position;
        this.word = word;
        this.translation = translation;
        this.example = example;
        this.exampleTranslation = exampleTranslation;
        this.category = category;
        this.vocabularyWord = vocabularyWord;
        this.reviewItem = reviewItem;
    }

    public void record(VocabularyReviewScheduler.ReviewDecision decision) { vocabularyWord.record(decision); }
    public UUID getId() { return id; }
    public int getPosition() { return position; }
    public String getWord() { return word; }
    public String getTranslation() { return translation; }
    public String getExample() { return example; }
    public String getExampleTranslation() { return exampleTranslation; }
    public VocabularyCategory getCategory() { return category; }
    public UserVocabularyWordEntity getVocabularyWord() { return vocabularyWord; }
    public VocabularyService.ProgressStatus getStatus() { return vocabularyWord.getStatus(); }
    public int getCorrectCount() { return vocabularyWord.getCorrectCount(); }
    public int getIncorrectCount() { return vocabularyWord.getIncorrectCount(); }
    public boolean isReviewItem() { return reviewItem; }
}
