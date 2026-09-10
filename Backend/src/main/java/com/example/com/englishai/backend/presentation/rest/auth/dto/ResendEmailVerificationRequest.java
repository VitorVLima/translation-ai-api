package com.example.com.englishai.backend.presentation.rest.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record ResendEmailVerificationRequest(
        @NotBlank(message = "Email is required") @Email(message = "Email must be valid") String email) {
    @Override public String toString() { return "ResendEmailVerificationRequest[email=[REDACTED]]"; }
}
