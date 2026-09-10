package com.example.com.englishai.backend.presentation.rest.auth;

import com.example.com.englishai.backend.application.authentication.LoginUser;
import com.example.com.englishai.backend.application.authentication.RefreshAccessToken;
import com.example.com.englishai.backend.application.authentication.LogoutSession;
import com.example.com.englishai.backend.application.authentication.RefreshAccessTokenResult;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.application.authentication.LoginResult;
import com.example.com.englishai.backend.application.authentication.RegisterUser;
import com.example.com.englishai.backend.application.authentication.VerifyEmailCode;
import com.example.com.englishai.backend.application.authentication.ResetPassword;
import com.example.com.englishai.backend.application.authentication.exception.InvalidCredentialsException;
import com.example.com.englishai.backend.application.authentication.exception.InvalidRefreshTokenException;
import com.example.com.englishai.backend.application.authentication.exception.RefreshTokenReuseException;
import com.example.com.englishai.backend.application.user.exception.UserAlreadyExistsException;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.infrastructure.security.SecurityConfig;
import com.example.com.englishai.backend.presentation.rest.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
@Import({SecurityConfig.class, GlobalExceptionHandler.class})
class AuthControllerLoginTest {

    private final MockMvc mockMvc;

    @MockitoBean
    private LoginUser loginUser;

    @MockitoBean
    private RefreshAccessToken refreshAccessToken;

    @MockitoBean
    private LogoutSession logoutSession;

    @MockitoBean
    private ResetPassword resetPassword;

    @MockitoBean
    private RegisterUser registerUser;

    @MockitoBean
    private VerifyEmailCode verifyEmailCode;

    @MockitoBean
    private AuthenticationTokenValidator tokenValidator;

    @Autowired
    AuthControllerLoginTest(MockMvc mockMvc) {
        this.mockMvc = mockMvc;
    }

    @Test
    void shouldAllowAnonymousLoginAndReturnPublicUserDataAndAccessToken() throws Exception {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.parse("2026-09-09T12:00:00Z");
        User user = new User(id, "user@test.com", "test-user", "stored-hash", now, now);
        when(loginUser.execute("user@test.com", "correct-password"))
                .thenReturn(new LoginResult(user, "test-access-token", "test-refresh-token"));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"user@test.com","password":"correct-password"}
                                """))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Pragma", "no-cache"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.user.id").value(id.toString()))
                .andExpect(jsonPath("$.user.email").value("user@test.com"))
                .andExpect(jsonPath("$.user.username").value("test-user"))
                .andExpect(jsonPath("$.user.createdAt").value("2026-09-09T12:00:00Z"))
                .andExpect(jsonPath("$.user.length()").value(4))
                .andExpect(jsonPath("$.accessToken").value("test-access-token"))
                .andExpect(jsonPath("$.refreshToken").value("test-refresh-token"))
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.user.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.tokenHash").doesNotExist())
                .andExpect(jsonPath("$.familyId").doesNotExist())
                .andExpect(jsonPath("$.revokedAt").doesNotExist())
                .andExpect(jsonPath("$.replacedById").doesNotExist());

        verify(loginUser).execute("user@test.com", "correct-password");
        verifyNoInteractions(registerUser);
    }

    @Test
    void shouldRejectMissingBodyBeforeCallingUseCase() throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(loginUser, registerUser);
    }

    @Test
    void shouldRejectMalformedJsonBeforeCallingUseCase() throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(loginUser, registerUser);
    }

    @Test
    void shouldNotCreateSessionOrAuthenticateSubsequentRequestAfterLogin() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        User user = new User(UUID.randomUUID(), "user@test.com", "test-user", "stored-hash", now, now);
        when(loginUser.execute("user@test.com", "correct-password"))
                .thenReturn(new LoginResult(user, "test-access-token"));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"user@test.com","password":"correct-password"}
                                """))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Pragma", "no-cache"))
                .andExpect(unauthenticated())
                .andExpect(cookie().doesNotExist("JSESSIONID"))
                .andExpect(result -> assertThat(result.getRequest().getSession(false)).isNull());

        // GET is protected: only POST is public on this path.
        mockMvc.perform(get("/api/v1/auth/login"))
                .andExpect(status().isUnauthorized())
                .andExpect(unauthenticated())
                .andExpect(result -> assertThat(result.getRequest().getSession(false)).isNull());

        verify(loginUser).execute("user@test.com", "correct-password");
        verifyNoMoreInteractions(loginUser);
        verifyNoInteractions(registerUser);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/auth/register", "/api/v1/auth/login"})
    void shouldNotPermitAnonymousGetOnAuthPaths(String path) throws Exception {
        mockMvc.perform(get(path))
                .andExpect(status().isUnauthorized())
                .andExpect(unauthenticated());

        verifyNoInteractions(loginUser, registerUser);
    }

    @Test
    void shouldReturnUnauthorizedForInvalidCredentials() throws Exception {
        when(loginUser.execute("user@test.com", "wrong-password"))
                .thenThrow(new InvalidCredentialsException());

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"user@test.com","password":"wrong-password"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(content().json("""
                        {"message":"Invalid credentials"}
                        """))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void shouldAllowAnonymousRefreshAndReturnTokenPair() throws Exception {
        when(refreshAccessToken.execute("current-refresh-token"))
                .thenReturn(new RefreshAccessTokenResult("new-access-token", "new-refresh-token"));

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"current-refresh-token\"}"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Pragma", "no-cache"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.accessToken").value("new-access-token"))
                .andExpect(jsonPath("$.refreshToken").value("new-refresh-token"))
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$.tokenHash").doesNotExist())
                .andExpect(jsonPath("$.familyId").doesNotExist())
                .andExpect(jsonPath("$.replacedById").doesNotExist());

        verify(refreshAccessToken).execute("current-refresh-token");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   "})
    void shouldRejectBlankRefreshToken(String token) throws Exception {
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + token + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.errors.refreshToken").value("Refresh token is required"));

        verifyNoInteractions(refreshAccessToken);
    }

    @Test
    void shouldRejectRefreshRequestWithoutToken() throws Exception {
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.refreshToken").value("Refresh token is required"));

        verifyNoInteractions(refreshAccessToken);
    }

    @ParameterizedTest
    @ValueSource(classes = {InvalidRefreshTokenException.class, RefreshTokenReuseException.class})
    void shouldReturnGenericUnauthorizedForInvalidRefreshTokens(
            Class<? extends RuntimeException> exceptionType
    ) throws Exception {
        RuntimeException exception = exceptionType == RefreshTokenReuseException.class
                ? new RefreshTokenReuseException()
                : new InvalidRefreshTokenException();
        when(refreshAccessToken.execute("invalid-refresh-token")).thenThrow(exception);

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"invalid-refresh-token\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().json("{\"message\":\"Invalid refresh token\"}"))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void shouldKeepRefreshGetProtected() throws Exception {
        mockMvc.perform(get("/api/v1/auth/refresh"))
                .andExpect(status().isUnauthorized())
                .andExpect(unauthenticated());
    }

    @Test
    void shouldAllowAnonymousLogoutAndReturnNoContent() throws Exception {
        mockMvc.perform(post("/api/v1/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"session-token\"}"))
                .andExpect(status().isNoContent())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Pragma", "no-cache"))
                .andExpect(content().string(""));

        verify(logoutSession).execute("session-token");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   "})
    void shouldRejectBlankLogoutToken(String token) throws Exception {
        mockMvc.perform(post("/api/v1/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + token + "\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(logoutSession);
    }

    @Test
    void shouldKeepLogoutGetProtected() throws Exception {
        mockMvc.perform(get("/api/v1/auth/logout"))
                .andExpect(status().isUnauthorized())
                .andExpect(unauthenticated());
    }

    @Test
    void shouldAllowAnonymousPasswordResetAndReturnNoContent() throws Exception {
        mockMvc.perform(post("/api/v1/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"user@test.com\",\"code\":\"482731\",\"newPassword\":\"NewPass123\"}"))
                .andExpect(status().isNoContent());
        verify(resetPassword).execute("user@test.com", "482731", "NewPass123");
    }

    @Test
    void shouldRejectInvalidPasswordResetCodeFormat() throws Exception {
        mockMvc.perform(post("/api/v1/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"user@test.com\",\"code\":\"42\",\"newPassword\":\"NewPass123\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(resetPassword);
    }

    @Test
    void shouldKeepPasswordResetGetProtected() throws Exception {
        mockMvc.perform(get("/api/v1/auth/reset-password"))
                .andExpect(status().isUnauthorized())
                .andExpect(unauthenticated());
    }

    @Test
    void shouldReturnConflictWhenRegistrationPersistenceDetectsDuplicate() throws Exception {
        when(registerUser.execute("user@test.com", "test-user", "password123"))
                .thenThrow(new UserAlreadyExistsException());

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"user@test.com","username":"test-user","password":"password123"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(content().json("""
                        {"message":"User already exists"}
                        """))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"email\":\"\",\"password\":\"some-password\"}",
            "{\"email\":\"invalid-email\",\"password\":\"some-password\"}",
            "{\"password\":\"some-password\"}"
    })
    void shouldRejectInvalidEmailBeforeCallingUseCase(String body) throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.errors.email").exists());

        verifyNoInteractions(loginUser, registerUser);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"email\":\"user@test.com\",\"password\":\"\"}",
            "{\"email\":\"user@test.com\",\"password\":\"   \"}",
            "{\"email\":\"user@test.com\"}"
    })
    void shouldRejectMissingOrBlankPasswordBeforeCallingUseCase(String body) throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.errors.password").value("Password is required"));

        verifyNoInteractions(loginUser, registerUser);
    }

    @Test
    void shouldVerifyEmailAndReturnNoContent() throws Exception {
        mockMvc.perform(post("/api/v1/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"user@test.com\",\"code\":\"000042\"}"))
                .andExpect(status().isNoContent());
        verify(verifyEmailCode).execute("user@test.com", "000042");
    }

    @Test
    void shouldRejectInvalidVerificationCodeFormat() throws Exception {
        mockMvc.perform(post("/api/v1/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"user@test.com\",\"code\":\"42\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.code").value("Code must contain exactly 6 digits"));
        verifyNoInteractions(verifyEmailCode);
    }

    @Test
    void shouldReturnForbiddenWhenEmailVerificationIsRequired() throws Exception {
        when(loginUser.execute("pending@test.com", "password"))
                .thenThrow(new com.example.com.englishai.backend.application.authentication.exception.EmailVerificationRequiredException());

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"pending@test.com\",\"password\":\"password\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Email verification required"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Pragma", "no-cache"))
                .andExpect(jsonPath("$.accessToken").doesNotExist());
    }
}
