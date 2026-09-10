package com.example.com.englishai.backend.application.user.usecase;

import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.application.user.exception.CurrentUserNotFoundException;
import com.example.com.englishai.backend.domain.user.User;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class GetCurrentUser {

    private final UserRepository userRepository;

    public GetCurrentUser(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User execute(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(CurrentUserNotFoundException::new);
    }
}
