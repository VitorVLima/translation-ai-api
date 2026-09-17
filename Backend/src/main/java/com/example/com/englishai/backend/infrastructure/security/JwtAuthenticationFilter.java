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
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.UUID;

public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final AuthenticationTokenValidator tokenValidator;
    private final AuthenticationEntryPoint entryPoint;
    private final boolean diagnosticsEnabled;

    public JwtAuthenticationFilter(AuthenticationTokenValidator tokenValidator,
                                   AuthenticationEntryPoint entryPoint) {
        this(tokenValidator, entryPoint, false);
    }

    public JwtAuthenticationFilter(AuthenticationTokenValidator tokenValidator,
                                   AuthenticationEntryPoint entryPoint,
                                   boolean diagnosticsEnabled) {
        this.tokenValidator = tokenValidator;
        this.entryPoint = entryPoint;
        this.diagnosticsEnabled = diagnosticsEnabled;
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
                throw new InvalidAuthenticationTokenException(InvalidAuthenticationTokenException.Reason.MISSING);
            }
            userId = tokenValidator.validateAndGetUserId(token);
        } catch (InvalidAuthenticationTokenException exception) {
            diagnostic(request, authorization, "REJECTED", exception.reason().name());
            SecurityContextHolder.clearContext();
            entryPoint.commence(request, response, new BadCredentialsException("Unauthorized"));
            return;
        }

        diagnostic(request, authorization, "ACCEPTED", null);

        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(userId, null, List.of()));
        SecurityContextHolder.setContext(context);
        filterChain.doFilter(request, response);
    }

    private void diagnostic(HttpServletRequest request, String authorization, String outcome, String reason) {
        if (!diagnosticsEnabled) return;
        String token = authorization != null && authorization.length() > 7 ? authorization.substring(7).trim() : "";
        System.getLogger(JwtAuthenticationFilter.class.getName()).log(System.Logger.Level.INFO,
                "JWT validation uri={0} method={1} bearer={2} fingerprint={3} outcome={4}{5}",
                request.getRequestURI(), request.getMethod(), authorization != null && authorization.regionMatches(true, 0, "Bearer ", 0, 7),
                fingerprint(token), outcome, reason == null ? "" : " reason=" + reason);
    }

    private static String fingerprint(String token) {
        if (token == null || token.isBlank()) return "none";
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder value = new StringBuilder(12);
            for (int index = 0; index < 6; index++) value.append(String.format("%02x", hash[index]));
            return value.toString();
        } catch (NoSuchAlgorithmException exception) {
            return "unavailable";
        }
    }
}
