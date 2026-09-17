package com.example.com.englishai.backend.infrastructure.persistence.repository;
import com.example.com.englishai.backend.infrastructure.persistence.entity.ConversationEntity; import org.springframework.data.jpa.repository.JpaRepository; import java.util.*;
public interface ConversationJpaRepository extends JpaRepository<ConversationEntity,UUID> {
 long countByUserId(UUID userId);
 long countByUserIdAndEndedAtIsNull(UUID userId);
 @org.springframework.data.jpa.repository.Query("select c from ConversationEntity c where c.userId=:userId order by case when c.endedAt is null then 0 else 1 end, case when c.endedAt is null then c.updatedAt else null end desc, c.endedAt desc, c.id asc")
 List<ConversationEntity> findByUserIdOrderedForHistory(@org.springframework.data.repository.query.Param("userId") UUID userId);
 Optional<ConversationEntity> findByIdAndUserId(UUID id,UUID userId);
 @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
 @org.springframework.data.jpa.repository.Query("select c from ConversationEntity c where c.id=:id and c.userId=:userId")
 Optional<ConversationEntity> findForUpdateByIdAndUserId(@org.springframework.data.repository.query.Param("id") UUID id,
          @org.springframework.data.repository.query.Param("userId") UUID userId);
}
