package com.example.com.englishai.backend.infrastructure.persistence.repository;
import com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity;
import org.springframework.data.jpa.repository.*; import org.springframework.data.repository.query.Param; import jakarta.persistence.LockModeType;
import java.util.*;
public interface ReadingActivityJpaRepository extends JpaRepository<ReadingActivityEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from ReadingActivityEntity a where a.id=:id and a.userId=:userId")
    Optional<ReadingActivityEntity> findForUpdateByIdAndUserId(@Param("id") UUID id, @Param("userId") UUID userId);
}
