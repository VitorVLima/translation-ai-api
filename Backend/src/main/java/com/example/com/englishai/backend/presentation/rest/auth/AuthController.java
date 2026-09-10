package com.example.com.englishai.backend.presentation.rest.auth;

import com.example.com.englishai.backend.application.authentication.RegisterUser;
import com.example.com.englishai.backend.application.authentication.LoginUser;
import com.example.com.englishai.backend.application.authentication.LoginResult;
import com.example.com.englishai.backend.application.authentication.RefreshAccessToken;
import com.example.com.englishai.backend.application.authentication.RefreshAccessTokenResult;
import com.example.com.englishai.backend.application.authentication.LogoutSession;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LoginResponse;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LoginRequest;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.presentation.rest.auth.dto.RegisterRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.UserResponse;
import com.example.com.englishai.backend.presentation.rest.auth.dto.RefreshRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.TokenPairResponse;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LogoutRequest;
import jakarta.validation.Valid;
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

    public AuthController(RegisterUser registerUser, LoginUser loginUser, RefreshAccessToken refreshAccessToken,
                          LogoutSession logoutSession) {
        this.registerUser = registerUser;
        this.loginUser = loginUser;
        this.refreshAccessToken = refreshAccessToken;
        this.logoutSession = logoutSession;
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
