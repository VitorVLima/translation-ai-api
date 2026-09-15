package com.example.com.englishai.backend.infrastructure.persistence.entity;
import jakarta.persistence.*; import java.time.OffsetDateTime; import java.util.UUID;
@Entity @Table(name="conversation_messages", indexes=@Index(name="idx_conversation_messages_conversation_created", columnList="conversation_id,created_at"))
public class ConversationMessageEntity {
 @Id private UUID id; @Column(name="conversation_id",nullable=false) private UUID conversationId; @Column(nullable=false,length=16) private String role; @Column(nullable=false,columnDefinition="TEXT") private String content; @Column(name="corrected_text",columnDefinition="TEXT") private String correctedText; @Column(name="created_at",nullable=false) private OffsetDateTime createdAt;
 protected ConversationMessageEntity() {}
 public ConversationMessageEntity(UUID id,UUID conversationId,String role,String content,String correctedText,OffsetDateTime createdAt){this.id=id;this.conversationId=conversationId;this.role=role;this.content=content;this.correctedText=correctedText;this.createdAt=createdAt;}
 public UUID getId(){return id;} public UUID getConversationId(){return conversationId;} public String getRole(){return role;} public String getContent(){return content;} public String getCorrectedText(){return correctedText;} public OffsetDateTime getCreatedAt(){return createdAt;}
}
