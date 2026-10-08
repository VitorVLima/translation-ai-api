package com.example.com.englishai.backend.application.user.usecase;

import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.application.user.exception.EmailAlreadyExistsException;
import com.example.com.englishai.backend.domain.user.EmailAddress;
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

    public User execute(String email, String passwordHash) {
        String normalizedEmail = EmailAddress.normalize(email);

        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new EmailAlreadyExistsException();
        }

        OffsetDateTime now = OffsetDateTime.now();

        User user = new User(
                UUID.randomUUID(),
                normalizedEmail,
                null,
                passwordHash,
                now,
                now,
                false
        );

        return userRepository.save(user);
    }
}
