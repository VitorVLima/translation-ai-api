package com.example.com.englishai.backend.infrastructure.persistence.repository;
import com.example.com.englishai.backend.infrastructure.persistence.entity.ConversationMessageEntity; import org.springframework.data.jpa.repository.JpaRepository; import java.util.*;
public interface ConversationMessageJpaRepository extends JpaRepository<ConversationMessageEntity,UUID> { List<ConversationMessageEntity> findTop10ByConversationIdOrderByCreatedAtDesc(UUID conversationId); List<ConversationMessageEntity> findByConversationIdOrderByCreatedAtAsc(UUID conversationId); }
