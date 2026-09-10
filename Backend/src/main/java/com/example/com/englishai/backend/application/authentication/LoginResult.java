package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.domain.user.User;

public record LoginResult(User user, String accessToken) {
}
