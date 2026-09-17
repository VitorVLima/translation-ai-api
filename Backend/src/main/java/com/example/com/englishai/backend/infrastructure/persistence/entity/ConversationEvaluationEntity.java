package com.example.com.englishai.backend.infrastructure.persistence.entity;

import com.example.com.englishai.backend.application.conversation.ConversationDifficulty;
import com.example.com.englishai.backend.application.conversation.ConversationEvaluationService.Result;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "conversation_evaluations", uniqueConstraints = @UniqueConstraint(name = "uk_conversation_evaluation", columnNames = "conversation_id"))
public class ConversationEvaluationEntity {
    @Id private UUID id;
    @Column(name="conversation_id", nullable=false) private UUID conversationId;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=16) private ConversationDifficulty difficulty;
    @Column(nullable=false,length=64) private String scenario;
    @Column(name="communication_score",nullable=false) private int communicationScore;
    @Column(name="grammar_score",nullable=false) private int grammarScore;
    @Column(name="vocabulary_score",nullable=false) private int vocabularyScore;
    @Column(name="fluency_score",nullable=false) private int fluencyScore;
    @Column(name="relevance_score") private Integer relevanceScore;
    @Column(name="overall_score",nullable=false) private int overallScore;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=16) private Result result;
    @Column(nullable=false,columnDefinition="TEXT") private String strengths;
    @Column(nullable=false,columnDefinition="TEXT") private String improvements;
    @Column(name="evaluated_at",nullable=false) private OffsetDateTime evaluatedAt;

    protected ConversationEvaluationEntity() {}
    public ConversationEvaluationEntity(UUID id, ConversationEntity conversation, int communication, int grammar,
            int vocabulary, int fluency, int relevance, int overall, Result result, String strengths, String improvements, OffsetDateTime at) {
        this.id=id; this.conversationId=conversation.getId(); this.difficulty=conversation.getDifficulty();
        this.scenario=conversation.getScenarioKey(); this.communicationScore=communication; this.grammarScore=grammar;
        this.vocabularyScore=vocabulary; this.fluencyScore=fluency; this.relevanceScore=relevance; this.overallScore=overall;
        this.result=result; this.strengths=strengths; this.improvements=improvements; this.evaluatedAt=at;
    }
    public ConversationEvaluationEntity(UUID id, ConversationEntity conversation, int communication, int grammar,
            int vocabulary, int fluency, int overall, Result result, String strengths, String improvements, OffsetDateTime at) {
        this(id, conversation, communication, grammar, vocabulary, fluency, 0, overall, result, strengths, improvements, at);
        this.relevanceScore = null;
    }
    public UUID getId(){return id;} public UUID getConversationId(){return conversationId;}
    public ConversationDifficulty getDifficulty(){return difficulty;} public String getScenario(){return scenario;}
    public int getCommunicationScore(){return communicationScore;} public int getGrammarScore(){return grammarScore;}
    public int getVocabularyScore(){return vocabularyScore;} public int getFluencyScore(){return fluencyScore;}
    public int getOverallScore(){return overallScore;} public Integer getRelevanceScore(){return relevanceScore;} public Result getResult(){return result;}
    public String getStrengths(){return strengths;} public String getImprovements(){return improvements;}
    public OffsetDateTime getEvaluatedAt(){return evaluatedAt;}
}
