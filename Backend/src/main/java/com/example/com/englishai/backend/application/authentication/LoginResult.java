package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.domain.user.User;

public record LoginResult(User user, String accessToken, String refreshToken) {

    public LoginResult(User user, String accessToken) {
        this(user, accessToken, null);
    }

    @Override
    public String toString() {
        return "LoginResult[user=" + user + ", accessToken=[REDACTED], refreshToken=[REDACTED]]";
    }
}
