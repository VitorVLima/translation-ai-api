package com.example.com.englishai.backend.domain.user;

import java.time.OffsetDateTime;
import java.util.UUID;

public class User {

    private final UUID id;
    private final String email;
    private final String username;
    private final String passwordHash;
    private final OffsetDateTime createdAt;
    private final OffsetDateTime updatedAt;

    public User(
            UUID id,
            String email,
            String username,
            String passwordHash,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
        this.id = id;
        this.email = email;
        this.username = username;
        this.passwordHash = passwordHash;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getUsername() {
        return username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}