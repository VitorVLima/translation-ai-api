package com.example.com.englishai.backend.application.ports;

public interface PasswordEncoder {

    String encode(String rawPassword);

    boolean matches(String rawPassword, String encodedPassword);

    /**
     * Performs the same-cost password verification used for an unknown account.
     * The infrastructure adapter supplies a stable, non-user dummy hash.
     */
    boolean matchesDummy(String rawPassword);
}
