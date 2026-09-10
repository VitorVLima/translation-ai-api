package com.example.com.englishai.backend.application.user.usecase;

import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.application.user.exception.EmailAlreadyExistsException;
import com.example.com.englishai.backend.application.user.exception.UsernameAlreadyExistsException;
import com.example.com.englishai.backend.domain.user.User;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.UUID;

@Service
public class CreateUser {

    private final UserRepository userRepository;

    public CreateUser(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User execute(String email, String username, String passwordHash) {

        if (userRepository.existsByEmail(email)) {
            throw new EmailAlreadyExistsException();
        }

        if (userRepository.existsByUsername(username)) {
            throw new UsernameAlreadyExistsException();
        }

        OffsetDateTime now = OffsetDateTime.now();

        User user = new User(
                UUID.randomUUID(),
                email,
                username,
                passwordHash,
                now,
                now,
                false
        );

        return userRepository.save(user);
    }
}
