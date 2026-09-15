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
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${APP_CORS_ALLOWED_ORIGINS:http://localhost:5500,http://localhost:5501}") String allowedOrigins) {
        var configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim).filter(origin -> !origin.isEmpty()).toList());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
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
            ObjectProvider<AuthenticationRateLimitFilter> rateLimitFilter,
            ObjectProvider<UserJpaRepository> users
    ) throws Exception {

        var entryPoint = new UnauthorizedEntryPoint();
        var jwtFilter = new JwtAuthenticationFilter(tokenValidator, entryPoint);

        http
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
                
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(entryPoint))
                .sessionManagement(session ->
                        session.sessionCreationPolicy(
                                SessionCreationPolicy.STATELESS
                        )
                )

                // Como estamos criando uma API REST,
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {})

                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        // Catalog images are non-sensitive bytes loaded by <img>; browsers cannot
                        // attach the Bearer token from sessionStorage to that request.
                        .requestMatchers(HttpMethod.GET, "/api/v1/avatars/*/image").permitAll()
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

        users.ifAvailable(repo -> http.addFilterAfter(new AdminAuthorizationFilter(repo), JwtAuthenticationFilter.class));
        rateLimitFilter.ifAvailable(filter -> http.addFilterBefore(filter, JwtAuthenticationFilter.class));
        return http.build();
    }
}

