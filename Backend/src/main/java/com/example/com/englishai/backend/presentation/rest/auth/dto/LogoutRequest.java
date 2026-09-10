package com.example.com.englishai.backend.presentation.rest.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record LogoutRequest(
        @NotBlank(message = "Refresh token is required") String refreshToken
) {
}
