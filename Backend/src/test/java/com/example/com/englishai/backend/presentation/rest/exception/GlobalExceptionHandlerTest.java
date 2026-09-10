package com.example.com.englishai.backend.presentation.rest.exception;

import com.example.com.englishai.backend.application.user.exception.UserAlreadyExistsException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void shouldReturnConflictForPersistenceDuplicate() {
        var response = handler.handleUserAlreadyExists(new UserAlreadyExistsException());

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(response.getBody()).isEqualTo(new ErrorResponse("User already exists"));
    }
}
