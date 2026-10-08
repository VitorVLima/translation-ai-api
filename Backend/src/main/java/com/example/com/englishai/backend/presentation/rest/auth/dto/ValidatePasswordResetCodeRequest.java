package com.example.com.englishai.backend.presentation.rest.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record ValidatePasswordResetCodeRequest(
        @NotBlank @Email String email,
        @NotBlank @Pattern(regexp = "\\d{6}", message = "Code must contain exactly 6 digits") String code
) {
    @Override public String toString() { return "ValidatePasswordResetCodeRequest[email=[REDACTED], code=[REDACTED]]"; }
}
