package com.example.com.englishai.backend.infrastructure.persistence.repository;
import com.example.com.englishai.backend.infrastructure.persistence.entity.ConversationMessageEntity; import org.springframework.data.jpa.repository.JpaRepository; import java.util.*;
public interface ConversationMessageJpaRepository extends JpaRepository<ConversationMessageEntity,UUID> {
 List<ConversationMessageEntity> findTop10ByConversationIdOrderByCreatedAtDesc(UUID conversationId);
 List<ConversationMessageEntity> findByConversationIdOrderByCreatedAtAsc(UUID conversationId);
 List<ConversationMessageEntity> findByConversationIdOrderByCreatedAtAscIdAsc(UUID conversationId, org.springframework.data.domain.Pageable page);
 List<ConversationMessageEntity> findByConversationIdOrderByCreatedAtDescIdDesc(UUID conversationId, org.springframework.data.domain.Pageable page);
 @org.springframework.data.jpa.repository.Query(value="select count(*) from conversation_messages where conversation_id=:id and role='USER' and content ~ '[[:alpha:]]'",nativeQuery=true)
 long countLinguisticUserMessages(@org.springframework.data.repository.query.Param("id") UUID id);
}
