package com.example.com.englishai.backend.infrastructure.persistence.repository;
import com.example.com.englishai.backend.infrastructure.persistence.entity.VocabularyLessonEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VocabularyLessonJpaRepository extends JpaRepository<VocabularyLessonEntity, UUID> {
    @EntityGraph(attributePaths = {"items", "items.vocabularyWord"})
    Optional<VocabularyLessonEntity> findByUserIdAndLessonDate(UUID userId, LocalDate date);
    Optional<VocabularyLessonEntity> findByIdAndUserId(UUID id, UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @EntityGraph(attributePaths = {"items", "items.vocabularyWord"})
    @Query("select l from VocabularyLessonEntity l where l.id = :id and l.userId = :userId")
    Optional<VocabularyLessonEntity> findForUpdateByIdAndUserId(@Param("id") UUID id, @Param("userId") UUID userId);

    @Query("select i.word from VocabularyItemEntity i where i.lesson.userId = :userId order by i.lesson.lessonDate desc, i.position asc")
    List<String> findRecentWords(@Param("userId") UUID userId, Pageable pageable);
}
