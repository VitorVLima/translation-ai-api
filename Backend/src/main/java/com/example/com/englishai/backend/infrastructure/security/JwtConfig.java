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
            @Value("${security.jwt.secret}") String secret,
            @Value("${security.jwt.clock-skew-seconds:60}") long clockSkewSeconds,
            @Value("${security.jwt.issuer:englishai}") String issuer,
            @Value("${security.jwt.audience:englishai-api}") String audience
    ) {
        if (clockSkewSeconds < 0) {
            throw new IllegalArgumentException("JWT clock skew must not be negative");
        }
        return new JwtTokenValidator(secret, Clock.systemUTC(), Duration.ofSeconds(clockSkewSeconds), issuer, audience);
    }

    @Bean
    public AuthenticationTokenGenerator authenticationTokenGenerator(
            @Value("${security.jwt.secret}") String secret,
            @Value("${security.jwt.expiration-seconds}") long expirationSeconds,
            @Value("${security.jwt.issuer:englishai}") String issuer,
            @Value("${security.jwt.audience:englishai-api}") String audience
    ) {
        return new JwtTokenGenerator(secret, Duration.ofSeconds(expirationSeconds), Clock.systemUTC(), issuer, audience);
    }
}
