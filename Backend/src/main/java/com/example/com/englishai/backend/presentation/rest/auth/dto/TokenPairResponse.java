package com.example.com.englishai.backend.presentation.rest.auth.dto;

import com.example.com.englishai.backend.application.authentication.RefreshAccessTokenResult;

public record TokenPairResponse(String accessToken, String refreshToken) {

    public static TokenPairResponse from(RefreshAccessTokenResult result) {
        return new TokenPairResponse(result.accessToken(), result.refreshToken());
    }
}
