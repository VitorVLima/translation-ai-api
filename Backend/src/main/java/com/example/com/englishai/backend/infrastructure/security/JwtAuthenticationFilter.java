package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.authentication.exception.InvalidAuthenticationTokenException;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final AuthenticationTokenValidator tokenValidator;
    private final AuthenticationEntryPoint entryPoint;

    public JwtAuthenticationFilter(AuthenticationTokenValidator tokenValidator,
                                   AuthenticationEntryPoint entryPoint) {
        this.tokenValidator = tokenValidator;
        this.entryPoint = entryPoint;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authorization == null || (!authorization.equalsIgnoreCase("Bearer")
                && !authorization.regionMatches(true, 0, "Bearer ", 0, 7))) {
            filterChain.doFilter(request, response);
            return;
        }

        UUID userId;
        try {
            String token = authorization.length() > 7 ? authorization.substring(7).trim() : "";
            if (token.isEmpty()) {
                throw new InvalidAuthenticationTokenException();
            }
            userId = tokenValidator.validateAndGetUserId(token);
        } catch (InvalidAuthenticationTokenException exception) {
            SecurityContextHolder.clearContext();
            entryPoint.commence(request, response, new BadCredentialsException("Unauthorized"));
            return;
        }

        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(userId, null, List.of()));
        SecurityContextHolder.setContext(context);
        filterChain.doFilter(request, response);
    }
}
