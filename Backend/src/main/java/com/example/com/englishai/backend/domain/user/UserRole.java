package com.example.com.englishai.backend.domain.user;
public enum UserRole {
    USER, ADMIN, SUPER_ADMIN;

    public boolean atLeast(UserRole required) {
        return ordinal() >= required.ordinal();
    }
}
