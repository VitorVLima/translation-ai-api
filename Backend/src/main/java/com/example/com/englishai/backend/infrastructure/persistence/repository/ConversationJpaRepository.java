package com.example.com.englishai.backend.infrastructure.persistence.repository;
import com.example.com.englishai.backend.infrastructure.persistence.entity.ConversationEntity; import org.springframework.data.jpa.repository.JpaRepository; import java.util.*;
public interface ConversationJpaRepository extends JpaRepository<ConversationEntity,UUID> { long countByUserId(UUID userId); List<ConversationEntity> findByUserIdOrderByUpdatedAtDesc(UUID userId); Optional<ConversationEntity> findByIdAndUserId(UUID id,UUID userId); }
