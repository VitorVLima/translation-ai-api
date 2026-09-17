package com.example.com.englishai.backend.infrastructure.persistence.entity;

import com.example.com.englishai.backend.application.reading.ReadingService;
import jakarta.persistence.*;
import java.util.UUID;
import java.util.List;

@Entity @Table(name="reading_questions", uniqueConstraints=@UniqueConstraint(name="uk_reading_question_number", columnNames={"activity_id","question_number"}))
public class ReadingQuestionEntity {
    @Id private UUID id;
    @Column(name="activity_id", nullable=false) private UUID activityId;
    @Column(name="question_number", nullable=false) private short questionNumber;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=16) private ReadingService.QuestionType type;
    @Column(nullable=false, length=500) private String question;
    @Column(name="option_a", nullable=false, length=300) private String optionA;
    @Column(name="option_b", nullable=false, length=300) private String optionB;
    @Column(name="option_c", nullable=false, length=300) private String optionC;
    @Column(name="option_d", nullable=false, length=300) private String optionD;
    @Column(name="correct_option", nullable=false) private short correctOption;
    @Column(nullable=false, length=800) private String explanation;
    protected ReadingQuestionEntity() {}
    public ReadingQuestionEntity(UUID id, UUID activityId, int number, ReadingService.Question question) {
        this.id=id; this.activityId=activityId; this.questionNumber=(short)number; this.type=question.type(); this.question=question.question();
        this.optionA=question.options().get(0); this.optionB=question.options().get(1); this.optionC=question.options().get(2); this.optionD=question.options().get(3);
        this.correctOption=(short)question.correctOption(); this.explanation=question.explanation();
    }
    public UUID getId(){return id;} public UUID getActivityId(){return activityId;} public int getQuestionNumber(){return questionNumber;} public ReadingService.QuestionType getType(){return type;}
    public String getQuestion(){return question;} public List<String> getOptions(){return List.of(optionA,optionB,optionC,optionD);} public int getCorrectOption(){return correctOption;} public String getExplanation(){return explanation;}
}
