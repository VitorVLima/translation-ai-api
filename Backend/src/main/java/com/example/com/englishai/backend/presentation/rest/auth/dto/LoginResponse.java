package com.example.com.englishai.backend.presentation.rest.auth.dto;

import com.example.com.englishai.backend.application.authentication.LoginResult;

public record LoginResponse(UserResponse user, String accessToken, String refreshToken) {

    public static LoginResponse from(LoginResult result) {
        return new LoginResponse(UserResponse.from(result.user()), result.accessToken(), result.refreshToken());
    }

    @Override
    public String toString() {
        return "LoginResponse[user=" + user + ", accessToken=[REDACTED], refreshToken=[REDACTED]]";
    }
}
