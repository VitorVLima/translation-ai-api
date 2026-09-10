package com.example.com.englishai.backend.presentation.rest.auth;

import com.example.com.englishai.backend.application.authentication.RegisterUser;
import com.example.com.englishai.backend.application.authentication.LoginUser;
import com.example.com.englishai.backend.application.authentication.LoginResult;
import com.example.com.englishai.backend.application.authentication.RefreshAccessToken;
import com.example.com.englishai.backend.application.authentication.RefreshAccessTokenResult;
import com.example.com.englishai.backend.application.authentication.LogoutSession;
import com.example.com.englishai.backend.application.authentication.VerifyEmailCode;
import com.example.com.englishai.backend.application.authentication.ResendEmailVerificationCode;
import com.example.com.englishai.backend.application.authentication.RequestPasswordReset;
import com.example.com.englishai.backend.application.authentication.ResetPassword;
import com.example.com.englishai.backend.presentation.rest.auth.dto.ForgotPasswordRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LoginResponse;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LoginRequest;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.presentation.rest.auth.dto.RegisterRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.UserResponse;
import com.example.com.englishai.backend.presentation.rest.auth.dto.RefreshRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.TokenPairResponse;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LogoutRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.VerifyEmailRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.ResendEmailVerificationRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.ResetPasswordRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final RegisterUser registerUser;
    private final LoginUser loginUser;
    private final RefreshAccessToken refreshAccessToken;
    private final LogoutSession logoutSession;
    private final ObjectProvider<VerifyEmailCode> verifyEmailCode;
    private final ObjectProvider<ResendEmailVerificationCode> resendEmailVerificationCode;
    private final ObjectProvider<RequestPasswordReset> requestPasswordReset;
    private final ObjectProvider<ResetPassword> resetPassword;

    @Autowired
    public AuthController(RegisterUser registerUser, LoginUser loginUser, RefreshAccessToken refreshAccessToken,
                          LogoutSession logoutSession, ObjectProvider<VerifyEmailCode> verifyEmailCode,
                          ObjectProvider<ResendEmailVerificationCode> resendEmailVerificationCode,
                          ObjectProvider<RequestPasswordReset> requestPasswordReset,
                          ObjectProvider<ResetPassword> resetPassword) {
        this.registerUser = registerUser;
        this.loginUser = loginUser;
        this.refreshAccessToken = refreshAccessToken;
        this.logoutSession = logoutSession;
        this.verifyEmailCode = verifyEmailCode;
        this.resendEmailVerificationCode = resendEmailVerificationCode;
        this.requestPasswordReset = requestPasswordReset;
        this.resetPassword = resetPassword;
    }

    /** Compatibility constructor for focused controller advice tests. */
    public AuthController(RegisterUser registerUser, LoginUser loginUser, RefreshAccessToken refreshAccessToken,
                          LogoutSession logoutSession) {
        this.registerUser = registerUser;
        this.loginUser = loginUser;
        this.refreshAccessToken = refreshAccessToken;
        this.logoutSession = logoutSession;
        this.verifyEmailCode = null;
        this.resendEmailVerificationCode = null;
        this.requestPasswordReset = null;
        this.resetPassword = null;
    }

    @PostMapping("/verify-email")
    public ResponseEntity<Void> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        VerifyEmailCode useCase = verifyEmailCode.getIfAvailable();
        if (useCase == null) throw new IllegalStateException("Email verification is unavailable");
        useCase.execute(request.email(), request.code());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<Void> resendVerification(@Valid @RequestBody ResendEmailVerificationRequest request) {
        ResendEmailVerificationCode useCase = resendEmailVerificationCode.getIfAvailable();
        if (useCase == null) throw new IllegalStateException("Email verification is unavailable");
        useCase.execute(request.email());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        var useCase = requestPasswordReset.getIfAvailable();
        if (useCase != null) useCase.execute(request.email());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        var useCase = resetPassword.getIfAvailable();
        if (useCase != null) useCase.execute(request.email(), request.code(), request.newPassword());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@Valid @RequestBody LogoutRequest request) {
        logoutSession.execute(request.refreshToken());
        return ResponseEntity.noContent()
                .header("Cache-Control", "no-store")
                .header("Pragma", "no-cache")
                .build();
    }

    @PostMapping("/refresh")
    public ResponseEntity<TokenPairResponse> refresh(
            @Valid @RequestBody RefreshRequest request
    ) {
        RefreshAccessTokenResult result = refreshAccessToken.execute(request.refreshToken());
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .header("Pragma", "no-cache")
                .body(TokenPairResponse.from(result));
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request
    ) {
        LoginResult result = loginUser.execute(request.email(), request.password());
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .header("Pragma", "no-cache")
                .body(LoginResponse.from(result));
    }

    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(
            @Valid @RequestBody RegisterRequest request
    ) {

        User user = registerUser.execute(
                request.email(),
                request.username(),
                request.password()
        );

        UserResponse response = UserResponse.from(user);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(response);
    }
}
