package com.example.com.englishai.backend.presentation.rest.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record GoogleLoginRequest(@NotBlank String credential, @NotBlank String nonce) {
    @Override public String toString() { return "GoogleLoginRequest[credential=[REDACTED], nonce=[REDACTED]]"; }
}
