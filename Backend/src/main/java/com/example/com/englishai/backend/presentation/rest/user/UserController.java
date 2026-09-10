package com.example.com.englishai.backend.presentation.rest.user;

import com.example.com.englishai.backend.application.user.usecase.GetCurrentUser;
import com.example.com.englishai.backend.presentation.rest.auth.dto.UserResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final GetCurrentUser getCurrentUser;

    public UserController(GetCurrentUser getCurrentUser) {
        this.getCurrentUser = getCurrentUser;
    }

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal UUID userId) {
        return UserResponse.from(getCurrentUser.execute(userId));
    }
}
