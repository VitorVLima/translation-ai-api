package com.example.com.englishai.backend.infrastructure.persistence.mapper;

import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import org.springframework.stereotype.Component;

@Component
public class UserMapper {

    public User toDomain(UserEntity entity) {
        return new User(
                entity.getId(),
                entity.getEmail(),
                entity.getUsername(),
                entity.getPasswordHash(),
                entity.getCreatedAt(),
                entity.getUpdatedAt(),
                entity.isEmailVerified()
        );
    }

    public UserEntity toEntity(User user) {
        return new UserEntity(
                user.getId(),
                user.getEmail(),
                user.getUsername(),
                user.getPasswordHash(),
                user.getCreatedAt(),
                user.getUpdatedAt(),
                user.isEmailVerified()
        );
    }
}
