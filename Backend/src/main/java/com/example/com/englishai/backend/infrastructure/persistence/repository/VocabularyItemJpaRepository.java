package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.application.vocabulary.VocabularyCategory;
import com.example.com.englishai.backend.infrastructure.persistence.entity.VocabularyItemEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface VocabularyItemJpaRepository extends JpaRepository<VocabularyItemEntity, UUID> {
    @Query("select i from VocabularyItemEntity i join fetch i.vocabularyWord where i.lesson.userId = :userId "
            + "and i.category = :category and i.vocabularyWord.id in :wordIds "
            + "order by i.lesson.lessonDate desc, i.position desc")
    List<VocabularyItemEntity> findRecentSourcesByVocabularyWordIds(@Param("userId") UUID userId,
                                                                      @Param("category") VocabularyCategory category,
                                                                      @Param("wordIds") Collection<UUID> wordIds);
}
