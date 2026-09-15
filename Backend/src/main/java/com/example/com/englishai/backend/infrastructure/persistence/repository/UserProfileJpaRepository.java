package com.example.com.englishai.backend.infrastructure.persistence.repository;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserProfileEntity; import org.springframework.data.jpa.repository.JpaRepository; import java.util.UUID;
public interface UserProfileJpaRepository extends JpaRepository<UserProfileEntity, UUID> {}
