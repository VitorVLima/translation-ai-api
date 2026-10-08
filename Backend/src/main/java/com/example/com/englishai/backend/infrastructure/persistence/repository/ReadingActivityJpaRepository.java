package com.example.com.englishai.backend.infrastructure.persistence.repository;
import com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity;
import org.springframework.data.jpa.repository.*; import org.springframework.data.repository.query.Param; import jakarta.persistence.LockModeType;
import java.util.*;
public interface ReadingActivityJpaRepository extends JpaRepository<ReadingActivityEntity, UUID> {
    List<ReadingActivityEntity> findByUserIdOrderByCreatedAtDesc(UUID userId);

    @Query("select a.id as activityId, a.title as title, a.difficulty as difficulty, a.topic as topic, "
            + "a.status as status, a.questionCount as questionCount, a.correctAnswers as correctAnswers, "
            + "a.comprehensionPercentage as comprehensionPercentage, a.createdAt as createdAt, "
            + "a.completedAt as completedAt from ReadingActivityEntity a where a.userId=:userId "
            + "order by a.createdAt desc, a.id desc")
    List<SummaryView> findSummariesByUserId(@Param("userId") UUID userId,
                                            org.springframework.data.domain.Pageable page);

    interface SummaryView {
        UUID getActivityId();
        String getTitle();
        com.example.com.englishai.backend.application.conversation.ConversationDifficulty getDifficulty();
        com.example.com.englishai.backend.application.reading.ReadingTopic getTopic();
        ReadingActivityEntity.ReadingActivityStatus getStatus();
        short getQuestionCount();
        Short getCorrectAnswers();
        Short getComprehensionPercentage();
        java.time.OffsetDateTime getCreatedAt();
        java.time.OffsetDateTime getCompletedAt();
    }

    boolean existsByUserIdAndStatus(UUID userId, ReadingActivityEntity.ReadingActivityStatus status);

    Optional<ReadingActivityEntity> findByIdAndUserId(UUID id, UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from ReadingActivityEntity a where a.id=:id and a.userId=:userId")
    Optional<ReadingActivityEntity> findForUpdateByIdAndUserId(@Param("id") UUID id, @Param("userId") UUID userId);
}
