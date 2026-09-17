package com.example.com.englishai.backend.infrastructure.persistence.repository;
import com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingQuestionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface ReadingQuestionJpaRepository extends JpaRepository<ReadingQuestionEntity, UUID> {
    List<ReadingQuestionEntity> findByActivityIdOrderByQuestionNumber(UUID activityId);
}
