package com.example.com.englishai.backend.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "users")
public class UserEntity {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified;

    protected UserEntity() {
    }

    public UserEntity(
            UUID id,
            String email,
            String username,
            String passwordHash,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
        this(id, email, username, passwordHash, createdAt, updatedAt, true);
    }

    public UserEntity(UUID id, String email, String username, String passwordHash,
                      OffsetDateTime createdAt, OffsetDateTime updatedAt, boolean emailVerified) {
        this.id = id;
        this.email = email;
        this.username = username;
        this.passwordHash = passwordHash;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.emailVerified = emailVerified;
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

    public boolean isEmailVerified() { return emailVerified; }

    @Override
    public String toString() {
        return "UserEntity[id=" + id + ", email=" + email + ", username=" + username
                + ", createdAt=" + createdAt + ", updatedAt=" + updatedAt
                + ", emailVerified=" + emailVerified
                + ", passwordHash=[REDACTED]]";
    }
}
