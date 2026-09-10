package com.example.com.englishai.backend.presentation.rest.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record VerifyEmailRequest(
        @NotBlank(message = "Email is required")
        @Email(message = "Email must be valid") String email,
        @NotBlank(message = "Code is required")
        @Pattern(regexp = "\\d{6}", message = "Code must contain exactly 6 digits") String code
) {
    @Override
    public String toString() { return "VerifyEmailRequest[email=" + email + ", code=[REDACTED]]"; }
}
