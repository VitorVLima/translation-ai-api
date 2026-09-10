package com.example.com.englishai.backend.application.authentication;

import com.example.com.englishai.backend.application.authentication.exception.InvalidCredentialsException;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenGenerator;
import com.example.com.englishai.backend.application.ports.PasswordEncoder;
import com.example.com.englishai.backend.application.ports.UserRepository;
import com.example.com.englishai.backend.domain.user.User;
import org.springframework.stereotype.Service;

@Service
public class LoginUser {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationTokenGenerator tokenGenerator;

    public LoginUser(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuthenticationTokenGenerator tokenGenerator
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenGenerator = tokenGenerator;
    }

    public LoginResult execute(String email, String rawPassword) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(InvalidCredentialsException::new);

        if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }

        String accessToken = tokenGenerator.generate(user.getId());
        return new LoginResult(user, accessToken);
    }
}
