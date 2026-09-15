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
    private final boolean emailVerified;
    private final UserRole role;

    public User(
            UUID id,
            String email,
            String username,
            String passwordHash,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
        this(id, email, username, passwordHash, createdAt, updatedAt, true, UserRole.USER);
    }

    public User(UUID id, String email, String username, String passwordHash,
                OffsetDateTime createdAt, OffsetDateTime updatedAt, boolean emailVerified) {
        this(id, email, username, passwordHash, createdAt, updatedAt, emailVerified, UserRole.USER);
    }
    public User(UUID id, String email, String username, String passwordHash,
                OffsetDateTime createdAt, OffsetDateTime updatedAt, boolean emailVerified, UserRole role) {
        this.id = id;
        this.email = email;
        this.username = username;
        this.passwordHash = passwordHash;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.emailVerified = emailVerified;
        this.role = role == null ? UserRole.USER : role;
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
    public UserRole getRole() { return role; }

    public User verifyEmail(OffsetDateTime verifiedAt) {
        return new User(id, email, username, passwordHash, createdAt, verifiedAt, true, role);
    }

    public User changePassword(String newPasswordHash, OffsetDateTime changedAt) {
        return new User(id, email, username, newPasswordHash, createdAt, changedAt, emailVerified, role);
    }

    @Override
    public String toString() {
        return "User[id=" + id + ", email=" + email + ", username=" + username
                + ", createdAt=" + createdAt + ", updatedAt=" + updatedAt
                + ", emailVerified=" + emailVerified
                + ", passwordHash=[REDACTED]]";
    }
}
