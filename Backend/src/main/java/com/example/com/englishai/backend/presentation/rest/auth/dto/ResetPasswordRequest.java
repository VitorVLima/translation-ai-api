package com.example.com.englishai.backend.presentation.rest.auth.dto;

import com.example.com.englishai.backend.presentation.rest.validation.Utf8ByteLength;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @NotBlank @Email String email,
        @NotBlank @Pattern(regexp = "\\d{6}", message = "Code must contain exactly 6 digits") String code,
        @NotBlank @Size(min = 6, max = 100) @Utf8ByteLength(max = 72) String newPassword
) { }
