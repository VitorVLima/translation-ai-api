package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import com.example.com.englishai.backend.domain.user.UserRole;

public interface UserJpaRepository extends JpaRepository<UserEntity, UUID> {

    @Query("select u.id as id, u.email as email, u.username as username, u.role as role, "
            + "u.createdAt as createdAt from UserEntity u where :term = '' "
            + "or locate(:term, lower(u.email)) > 0 or locate(:term, lower(u.username)) > 0 "
            + "order by u.createdAt asc, u.id asc")
    List<AdminUserSummaryView> findSummariesForAdmin(@Param("term") String term,
                                                     org.springframework.data.domain.Pageable page);

    interface AdminUserSummaryView {
        UUID getId();
        String getEmail();
        String getUsername();
        UserRole getRole();
        java.time.OffsetDateTime getCreatedAt();
    }

    boolean existsByEmail(String email);

    boolean existsByUsername(String username);

    Optional<UserEntity> findByEmail(String email);

    @Query("select u from UserEntity u where lower(trim(u.email)) = :email")
    List<UserEntity> findAllByNormalizedEmail(@Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserEntity u where u.id = :id")
    Optional<UserEntity> findByIdForUpdate(@Param("id") UUID id);

    long countByRole(UserRole role);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserEntity u where u.email = :email")
    Optional<UserEntity> findByEmailForUpdate(@Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserEntity u where lower(trim(u.email)) = :email")
    List<UserEntity> findAllByNormalizedEmailForUpdate(@Param("email") String email);

}
