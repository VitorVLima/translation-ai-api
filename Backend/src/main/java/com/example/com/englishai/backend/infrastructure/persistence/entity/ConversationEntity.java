package com.example.com.englishai.backend.infrastructure.persistence.entity;
import jakarta.persistence.*; import java.time.OffsetDateTime; import java.util.UUID;
import com.example.com.englishai.backend.application.conversation.ConversationDifficulty;
@Entity @Table(name="conversations", indexes=@Index(name="idx_conversations_user_updated", columnList="user_id,updated_at"))
public class ConversationEntity {
 @Id private UUID id; @Column(name="user_id",nullable=false) private UUID userId;
 @Column(nullable=false,length=64) private String scenario;
 @Enumerated(EnumType.STRING) @Column(nullable=false,length=16) private ConversationDifficulty difficulty;
 @Column(nullable=false,length=2) private String language; @Column(nullable=false,length=200) private String title;
 @Column(name="created_at",nullable=false) private OffsetDateTime createdAt; @Column(name="updated_at",nullable=false) private OffsetDateTime updatedAt;
 @Column(name="ended_at") private OffsetDateTime endedAt;
 @Column(name="response_in_progress",nullable=false) private boolean responseInProgress;
 public OffsetDateTime getEndedAt(){return endedAt;}
 public boolean isResponseInProgress(){return responseInProgress;}
 public void requireActive(){if(endedAt!=null)throw new IllegalStateException("Conversation has ended");}
 public void beginResponse(){requireActive();if(responseInProgress)throw new IllegalStateException("Conversation response in progress");responseInProgress=true;}
 public void finishResponse(){responseInProgress=false;}
 public void end(OffsetDateTime now){requireActive();if(responseInProgress)throw new IllegalStateException("Conversation response in progress");endedAt=now;touch(now);}
 protected ConversationEntity() {}
 public ConversationEntity(UUID id,UUID userId,com.example.com.englishai.backend.application.conversation.ConversationScenario scenario,String language,String title,OffsetDateTime now){this(id,userId,scenario.name(),language,title,now,ConversationDifficulty.INTERMEDIATE);}
 public ConversationEntity(UUID id,UUID userId,String scenario,String language,String title,OffsetDateTime now){this(id,userId,scenario,language,title,now,ConversationDifficulty.INTERMEDIATE);}
 public ConversationEntity(UUID id,UUID userId,String scenario,String language,String title,OffsetDateTime now,ConversationDifficulty difficulty){this.id=id;this.userId=userId;this.scenario=scenario;this.language=language;this.title=title;this.difficulty=difficulty==null?ConversationDifficulty.INTERMEDIATE:difficulty;this.createdAt=now;this.updatedAt=now;}
 public UUID getId(){return id;} public UUID getUserId(){return userId;} public String getScenarioKey(){return scenario;} public ConversationDifficulty getDifficulty(){return difficulty==null?ConversationDifficulty.INTERMEDIATE:difficulty;} public String getLanguage(){return language;} public String getTitle(){return title;} public OffsetDateTime getCreatedAt(){return createdAt;} public OffsetDateTime getUpdatedAt(){return updatedAt;} public void touch(OffsetDateTime now){updatedAt=now;}
}
