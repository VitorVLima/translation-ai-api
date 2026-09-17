package com.example.com.englishai.backend.infrastructure.persistence.entity;

import com.example.com.englishai.backend.application.conversation.ConversationDifficulty;
import com.example.com.englishai.backend.application.reading.ReadingService;
import com.example.com.englishai.backend.application.reading.ReadingTopic;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "reading_activities", indexes = {
        @Index(name = "idx_reading_activity_user_completed", columnList = "user_id,completed_at"),
        @Index(name = "idx_reading_activity_user_difficulty", columnList = "user_id,difficulty")
})
public class ReadingActivityEntity {
    @Id private UUID id;
    @Column(name="user_id", nullable=false) private UUID userId;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=16) private ConversationDifficulty difficulty;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=32) private ReadingTopic topic;
    @Column(nullable=false, length=5000) private String text;
    @Column(name="question_count", nullable=false) private short questionCount;
    @Column(name="correct_answers") private Short correctAnswers;
    @Column(name="comprehension_percentage") private Short comprehensionPercentage;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=24) private ReadingActivityStatus status;
    @Column(name="created_at", nullable=false) private OffsetDateTime createdAt;
    @Column(name="completed_at") private OffsetDateTime completedAt;
    protected ReadingActivityEntity() {}
    public ReadingActivityEntity(UUID id, UUID userId, ConversationDifficulty difficulty, ReadingTopic topic, String text, OffsetDateTime createdAt) {
        this.id=id; this.userId=userId; this.difficulty=difficulty; this.topic=topic; this.text=text;
        this.questionCount=3; this.status=ReadingActivityStatus.IN_PROGRESS; this.createdAt=createdAt;
    }
    public void complete(int correct, int percentage, ReadingActivityStatus result, OffsetDateTime at) {
        if (status != ReadingActivityStatus.IN_PROGRESS) return;
        correctAnswers=(short)correct; comprehensionPercentage=(short)percentage; status=result; completedAt=at;
    }
    public UUID getId(){return id;} public UUID getUserId(){return userId;} public ConversationDifficulty getDifficulty(){return difficulty;}
    public ReadingTopic getTopic(){return topic;} public String getText(){return text;} public int getQuestionCount(){return questionCount;}
    public Integer getCorrectAnswers(){return correctAnswers==null?null:correctAnswers.intValue();}
    public Integer getComprehensionPercentage(){return comprehensionPercentage==null?null:comprehensionPercentage.intValue();}
    public ReadingActivityStatus getStatus(){return status;} public OffsetDateTime getCreatedAt(){return createdAt;} public OffsetDateTime getCompletedAt(){return completedAt;}
    public enum ReadingActivityStatus { IN_PROGRESS, SUCCESS, NEEDS_PRACTICE }
}
