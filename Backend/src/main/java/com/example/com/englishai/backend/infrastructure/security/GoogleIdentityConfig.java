package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.ports.ExternalIdentityProvider;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.RemoteJWKSet;
import com.nimbusds.jose.util.DefaultResourceRetriever;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.net.URL;
import java.time.Duration;

@Configuration
public class GoogleIdentityConfig {
    @Bean
    @ConditionalOnExpression("'${GOOGLE_CLIENT_ID:}'.trim().length() > 0")
    ExternalIdentityProvider googleIdentityProvider(
            @Value("${GOOGLE_CLIENT_ID}") String clientId,
            @Value("${SECURITY_GOOGLE_CLOCK_SKEW_SECONDS:60}") long skew,
            @Value("${SECURITY_GOOGLE_JWKS_CONNECT_TIMEOUT_MILLIS:2000}") int connectTimeout,
            @Value("${SECURITY_GOOGLE_JWKS_READ_TIMEOUT_MILLIS:3000}") int readTimeout) {
        if (clientId == null || clientId.isBlank()) throw new IllegalArgumentException("GOOGLE_CLIENT_ID is required");
        if (skew < 0 || connectTimeout <= 0 || readTimeout <= 0) throw new IllegalArgumentException("Invalid Google security settings");
        try {
            var retriever = new DefaultResourceRetriever(connectTimeout, readTimeout, 1_000_000);
            return new GoogleIdentityProvider(clientId, new RemoteJWKSet<>(new URL("https://www.googleapis.com/oauth2/v3/certs"), retriever),
                    java.time.Clock.systemUTC(), Duration.ofSeconds(skew));
        } catch (Exception e) { throw new IllegalArgumentException("Unable to configure Google identity provider", e); }
    }
}
