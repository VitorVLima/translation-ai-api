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

@Configuration
@EnableWebSecurity
public class SecurityConfig {

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

                // Regras de autorização
                .authorizeHttpRequests(auth -> auth
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
                        ).permitAll()

                        .anyRequest().authenticated()
                );

        rateLimitFilter.ifAvailable(filter -> http.addFilterBefore(filter, JwtAuthenticationFilter.class));
        return http.build();
    }
}
