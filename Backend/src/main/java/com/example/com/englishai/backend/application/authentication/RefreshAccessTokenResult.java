package com.example.com.englishai.backend.application.authentication;

public record RefreshAccessTokenResult(String accessToken, String refreshToken) {
    @Override
    public String toString() {
        return "RefreshAccessTokenResult[accessToken=[REDACTED], refreshToken=[REDACTED]]";
    }
}
