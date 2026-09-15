package com.example.com.englishai.backend.infrastructure.persistence.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;
import com.example.com.englishai.backend.domain.user.UserRole;

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
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16)
    private UserRole role = UserRole.USER;

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

    public UserEntity(UUID id, String email, String username, String passwordHash,
                      OffsetDateTime createdAt, OffsetDateTime updatedAt, boolean emailVerified, UserRole role) {
        this(id, email, username, passwordHash, createdAt, updatedAt, emailVerified);
        this.role = role == null ? UserRole.USER : role;
    }

    public boolean isEmailVerified() { return emailVerified; }
    public UserRole getRole() { return role; }
    public void setRole(UserRole role) { this.role = role == null ? UserRole.USER : role; }

    @Override
    public String toString() {
        return "UserEntity[id=" + id + ", email=" + email + ", username=" + username
                + ", createdAt=" + createdAt + ", updatedAt=" + updatedAt
                + ", emailVerified=" + emailVerified
                + ", passwordHash=[REDACTED]]";
    }
}
