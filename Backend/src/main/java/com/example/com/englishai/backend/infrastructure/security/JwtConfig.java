package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.ports.AuthenticationTokenGenerator;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.Duration;

@Configuration
public class JwtConfig {

    @Bean
    public AuthenticationTokenValidator authenticationTokenValidator(
            @Value("${security.jwt.secret}") String secret
    ) {
        return new JwtTokenValidator(secret, Clock.systemUTC());
    }

    @Bean
    public AuthenticationTokenGenerator authenticationTokenGenerator(
            @Value("${security.jwt.secret}") String secret,
            @Value("${security.jwt.expiration-seconds}") long expirationSeconds
    ) {
        return new JwtTokenGenerator(secret, Duration.ofSeconds(expirationSeconds), Clock.systemUTC());
    }
}
