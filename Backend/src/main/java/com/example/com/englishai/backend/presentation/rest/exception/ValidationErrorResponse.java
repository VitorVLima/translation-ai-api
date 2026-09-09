package com.example.com.englishai.backend.presentation.rest.exception;

import java.util.Map;

public record ValidationErrorResponse(
        String message,
        Map<String, String> errors
) {
}