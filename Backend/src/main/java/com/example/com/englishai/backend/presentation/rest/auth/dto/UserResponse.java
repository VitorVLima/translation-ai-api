package com.example.com.englishai.backend.presentation.rest.auth.dto;

import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.domain.user.UserRole;

import java.time.OffsetDateTime;
import java.util.UUID;

public record UserResponse(
        UUID id,
        String email,
        String username,
        OffsetDateTime createdAt,
        UserRole role
) {

    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getUsername(),
                user.getCreatedAt(), user.getRole()
        );
    }
}
