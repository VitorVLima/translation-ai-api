package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.ports.RefreshTokenGenerator;
import com.example.com.englishai.backend.application.ports.RefreshTokenHasher;
import com.example.com.englishai.backend.application.authentication.RefreshAccessToken;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenGenerator;
import com.example.com.englishai.backend.application.ports.RefreshTokenTransaction;
import com.example.com.englishai.backend.application.ports.RefreshTokenFamilyRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenRepository;
import com.example.com.englishai.backend.application.authentication.LogoutSession;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.Duration;

@Configuration
public class RefreshTokenConfig {

    @Bean
    public Clock refreshTokenClock() {
        return Clock.systemUTC();
    }

    @Bean
    public Duration refreshTokenExpiration(
            @Value("${security.refresh-token.expiration-seconds:604800}") long expirationSeconds
    ) {
        if (expirationSeconds < 1) {
            throw new IllegalArgumentException("Refresh token expiration must be positive");
        }
        return Duration.ofSeconds(expirationSeconds);
    }

    @Bean
    public Duration refreshTokenFamilyMaxLifetime(
            @Value("${security.refresh-token.family-max-lifetime-seconds:2592000}") long lifetimeSeconds
    ) {
        if (lifetimeSeconds <= 0) {
            throw new IllegalArgumentException("Refresh token family lifetime must be positive");
        }
        return Duration.ofSeconds(lifetimeSeconds);
    }

    @Bean
    @ConditionalOnProperty(name = "security.refresh-token.hash-secret")
    public RefreshAccessToken refreshAccessToken(
            RefreshTokenHasher hasher,
            RefreshTokenGenerator generator,
            AuthenticationTokenGenerator accessTokenGenerator,
            RefreshTokenFamilyRepository familyRepository,
            RefreshTokenTransaction transaction,
            @org.springframework.beans.factory.annotation.Qualifier("refreshTokenExpiration") Duration expiration,
            Clock clock
    ) {
        return new RefreshAccessToken(
                hasher, generator, accessTokenGenerator, familyRepository, transaction, expiration, clock
        );
    }

    @Bean
    @ConditionalOnProperty(name = "security.refresh-token.hash-secret")
    public LogoutSession logoutSession(
            RefreshTokenHasher hasher,
            RefreshTokenRepository tokenRepository,
            RefreshTokenFamilyRepository familyRepository,
            RefreshTokenTransaction transaction,
            Clock clock
    ) {
        return new LogoutSession(hasher, tokenRepository, familyRepository, transaction, clock);
    }

    @Bean
    @ConditionalOnProperty(name = "security.refresh-token.hash-secret")
    public RefreshTokenGenerator refreshTokenGenerator() {
        return new OpaqueRefreshTokenGenerator();
    }

    @Bean
    @ConditionalOnProperty(name = "security.refresh-token.hash-secret")
    public RefreshTokenHasher refreshTokenHasher(
            @Value("${security.refresh-token.hash-secret}") String secret
    ) {
        return new HmacRefreshTokenHasher(secret);
    }
}
