package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.ports.PasswordEncoder;
import com.example.com.englishai.backend.domain.user.User;
import com.example.com.englishai.backend.application.user.usecase.CreateUser;
import org.springframework.stereotype.Service;

@Service
public class RegisterUser {

    private final CreateUser createUser;
    private final PasswordEncoder passwordEncoder;

    public RegisterUser(
            CreateUser createUser,
            PasswordEncoder passwordEncoder
    ) {
        this.createUser = createUser;
        this.passwordEncoder = passwordEncoder;
    }

    public User execute(
            String email,
            String username,
            String rawPassword
    ) {

        String passwordHash = passwordEncoder.encode(rawPassword);

        return createUser.execute(
                email,
                username,
                passwordHash
        );
    }
}