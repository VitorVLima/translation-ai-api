package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.infrastructure.persistence.entity.ConversationEvaluationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface ConversationEvaluationJpaRepository extends JpaRepository<ConversationEvaluationEntity, UUID> {
    Optional<ConversationEvaluationEntity> findByConversationId(UUID conversationId);
}
