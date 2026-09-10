package com.example.com.englishai.backend.presentation.rest.auth.dto;

import com.example.com.englishai.backend.application.authentication.LoginResult;

public record LoginResponse(UserResponse user, String accessToken) {

    public static LoginResponse from(LoginResult result) {
        return new LoginResponse(UserResponse.from(result.user()), result.accessToken());
    }
}
