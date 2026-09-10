package com.example.com.englishai.backend.presentation.rest.auth;

import com.example.com.englishai.backend.application.authentication.RegisterUser;
import com.example.com.englishai.backend.application.authentication.LoginUser;
import com.example.com.englishai.backend.application.authentication.LoginResult;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LoginResponse;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LoginRequest;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.presentation.rest.auth.dto.RegisterRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.UserResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final RegisterUser registerUser;
    private final LoginUser loginUser;

    public AuthController(RegisterUser registerUser, LoginUser loginUser) {
        this.registerUser = registerUser;
        this.loginUser = loginUser;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request
    ) {
        LoginResult result = loginUser.execute(request.email(), request.password());
        return ResponseEntity.ok(LoginResponse.from(result));
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
