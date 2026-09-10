package com.example.com.englishai.backend.presentation.rest.auth;

import com.example.com.englishai.backend.application.authentication.LoginUser;
import com.example.com.englishai.backend.application.authentication.RegisterUser;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.application.user.exception.EmailAlreadyExistsException;
import com.example.com.englishai.backend.application.user.exception.UsernameAlreadyExistsException;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.infrastructure.security.SecurityConfig;
import com.example.com.englishai.backend.presentation.rest.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
@Import({SecurityConfig.class, GlobalExceptionHandler.class})
class AuthControllerRegisterTest {

    private final MockMvc mockMvc;

    @MockitoBean
    private RegisterUser registerUser;

    @MockitoBean
    private LoginUser loginUser;

    @MockitoBean
    private AuthenticationTokenValidator tokenValidator;

    @Autowired
    AuthControllerRegisterTest(MockMvc mockMvc) {
        this.mockMvc = mockMvc;
    }

    @Test
    void shouldRegisterValidUserAndReturnOnlyPublicData() throws Exception {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.parse("2026-09-09T12:00:00Z");
        User user = new User(id, "new-user@test.com", "new-user", "hashed-password", now, now);
        when(registerUser.execute("new-user@test.com", "new-user", "password123"))
                .thenReturn(user);

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"new-user@test.com","username":"new-user","password":"password123"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.email").value("new-user@test.com"))
                .andExpect(jsonPath("$.username").value("new-user"))
                .andExpect(jsonPath("$.createdAt").value("2026-09-09T12:00:00Z"))
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        verify(registerUser).execute("new-user@test.com", "new-user", "password123");
        verifyNoInteractions(loginUser);
    }

    @Test
    void shouldReturnConflictForDuplicateEmail() throws Exception {
        when(registerUser.execute("existing@test.com", "new-user", "password123"))
                .thenThrow(new EmailAlreadyExistsException());

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"existing@test.com","username":"new-user","password":"password123"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(content().json("{\"message\":\"Email already exists\"}"));
    }

    @Test
    void shouldReturnConflictForDuplicateUsername() throws Exception {
        when(registerUser.execute("new-user@test.com", "existing-user", "password123"))
                .thenThrow(new UsernameAlreadyExistsException());

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"new-user@test.com","username":"existing-user","password":"password123"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(content().json("{\"message\":\"Username already exists\"}"));
    }

    @Test
    void shouldRejectInvalidPasswordBeforeCallingUseCase() throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"new-user@test.com","username":"new-user","password":"123"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.errors.password").exists());

        verifyNoInteractions(registerUser, loginUser);
    }
}
