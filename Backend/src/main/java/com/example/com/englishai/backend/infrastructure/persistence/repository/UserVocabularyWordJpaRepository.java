package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.infrastructure.persistence.entity.UserVocabularyWordEntity;
import com.example.com.englishai.backend.application.vocabulary.VocabularyCategory;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserVocabularyWordJpaRepository extends JpaRepository<UserVocabularyWordEntity, UUID> {
    Optional<UserVocabularyWordEntity> findByUserIdAndNormalizedWord(UUID userId, String normalizedWord);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from UserVocabularyWordEntity w where w.userId = :userId and w.normalizedWord = :normalizedWord")
    Optional<UserVocabularyWordEntity> findForUpdateByUserIdAndNormalizedWord(@Param("userId") UUID userId,
                                                                                @Param("normalizedWord") String normalizedWord);

    @Query("select distinct w from UserVocabularyWordEntity w join VocabularyItemEntity i on i.vocabularyWord = w "
            + "where w.userId = :userId and i.category = :category and w.nextReviewAt is not null "
            + "and w.nextReviewAt <= :now order by w.nextReviewAt asc, w.id asc")
    List<UserVocabularyWordEntity> findDueForReview(@Param("userId") UUID userId,
                                                    @Param("category") VocabularyCategory category,
                                                    @Param("now") OffsetDateTime now,
                                                    Pageable pageable);

    @Query("select w.normalizedWord from UserVocabularyWordEntity w where w.userId = :userId "
            + "and w.normalizedWord in :normalizedWords")
    List<String> findExistingNormalizedWords(@Param("userId") UUID userId,
                                             @Param("normalizedWords") Collection<String> normalizedWords);

    @Modifying
    @Query(value = "INSERT INTO user_vocabulary_words "
            + "(id, user_id, word, normalized_word, status, correct_count, incorrect_count, "
            + "first_seen_at, last_seen_at, created_at, updated_at) "
            + "VALUES (:id, :userId, :word, :normalizedWord, 'NEW', 0, 0, :now, :now, :now, :now) "
            + "ON CONFLICT (user_id, normalized_word) DO NOTHING", nativeQuery = true)
    void insertIfAbsent(@Param("id") UUID id, @Param("userId") UUID userId, @Param("word") String word,
                        @Param("normalizedWord") String normalizedWord, @Param("now") OffsetDateTime now);
}
