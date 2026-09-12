package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.Arrays;
import java.util.List;
import jakarta.servlet.DispatcherType;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${APP_CORS_ALLOWED_ORIGINS:http://localhost:5500}") String allowedOrigins) {
        var configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim).filter(origin -> !origin.isEmpty()).toList());
        configuration.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Content-Type", "Authorization"));
        configuration.setAllowCredentials(false);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            AuthenticationTokenValidator tokenValidator,
            ObjectProvider<AuthenticationRateLimitFilter> rateLimitFilter
    ) throws Exception {

        var entryPoint = new UnauthorizedEntryPoint();
        var jwtFilter = new JwtAuthenticationFilter(tokenValidator, entryPoint);

        http
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(entryPoint))
                // Nossa API será stateless.
                // Não vamos usar sessão HTTP.
                .sessionManagement(session ->
                        session.sessionCreationPolicy(
                                SessionCreationPolicy.STATELESS
                        )
                )

                // Como estamos criando uma API REST,
                // não precisamos de CSRF baseado em sessão.
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {})

                // Regras de autorização
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(DispatcherType.ASYNC).permitAll()
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/v1/auth/register",
                                "/api/v1/auth/login",
                                "/api/v1/auth/refresh"
                                ,
                                "/api/v1/auth/logout",
                                "/api/v1/auth/verify-email"
                                ,
                                "/api/v1/auth/resend-verification"
                                ,
                                "/api/v1/auth/forgot-password"
                                ,
                                "/api/v1/auth/reset-password"
                                ,
                                "/api/v1/auth/google"
                                ,
                                "/api/v1/auth/google/nonce"
                        ).permitAll()

                        .anyRequest().authenticated()
                );

        rateLimitFilter.ifAvailable(filter -> http.addFilterBefore(filter, JwtAuthenticationFilter.class));
        return http.build();
    }
}
