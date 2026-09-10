package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.authentication.exception.RateLimitExceededException;
import com.example.com.englishai.backend.application.ports.RateLimitService;
import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;

public class AuthenticationRateLimitFilter extends OncePerRequestFilter {
    private final RateLimitService service;
    private final ClientIpResolver ipResolver;
    private final int loginCapacity;
    private final Duration loginWindow;
    private final int registerCapacity;
    private final Duration registerWindow;
    private final int refreshCapacity;
    private final Duration refreshWindow;
    private final int logoutCapacity;
    private final Duration logoutWindow;
    private final int verifyEmailCapacity;
    private final Duration verifyEmailWindow;
    private final int resendCapacity;
    private final Duration resendWindow;
    private final int resetCapacity;
    private final Duration resetWindow;

    public AuthenticationRateLimitFilter(RateLimitService service, ClientIpResolver ipResolver,
                                         int loginCapacity, Duration loginWindow,
                                         int registerCapacity, Duration registerWindow,
                                         int refreshCapacity, Duration refreshWindow,
                                         int logoutCapacity, Duration logoutWindow,
                                         int verifyEmailCapacity, Duration verifyEmailWindow,
                                         int resendCapacity, Duration resendWindow,
                                         int resetCapacity, Duration resetWindow) {
        this.service = service; this.ipResolver = ipResolver;
        this.loginCapacity = loginCapacity; this.loginWindow = loginWindow;
        this.registerCapacity = registerCapacity; this.registerWindow = registerWindow;
        this.refreshCapacity = refreshCapacity; this.refreshWindow = refreshWindow;
        this.logoutCapacity = logoutCapacity; this.logoutWindow = logoutWindow;
        this.verifyEmailCapacity = verifyEmailCapacity; this.verifyEmailWindow = verifyEmailWindow;
        this.resendCapacity = resendCapacity; this.resendWindow = resendWindow;
        this.resetCapacity = resetCapacity; this.resetWindow = resetWindow;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!"POST".equalsIgnoreCase(request.getMethod())) { chain.doFilter(request, response); return; }
        String path = request.getRequestURI();
        String bucket = null; int capacity = 0; Duration window = null;
        if (path.equals("/api/v1/auth/login")) { bucket = "login:ip:"; capacity = loginCapacity; window = loginWindow; }
        else if (path.equals("/api/v1/auth/register")) { bucket = "register:ip:"; capacity = registerCapacity; window = registerWindow; }
        else if (path.equals("/api/v1/auth/refresh")) { bucket = "refresh:ip:"; capacity = refreshCapacity; window = refreshWindow; }
        else if (path.equals("/api/v1/auth/logout")) { bucket = "logout:ip:"; capacity = logoutCapacity; window = logoutWindow; }
        else if (path.equals("/api/v1/auth/verify-email")) { bucket = "verify-email:ip:"; capacity = verifyEmailCapacity; window = verifyEmailWindow; }
        else if (path.equals("/api/v1/auth/resend-verification")) { bucket = "resend-verification:ip:"; capacity = resendCapacity; window = resendWindow; }
        else if (path.equals("/api/v1/auth/reset-password")) { bucket = "reset-password:ip:"; capacity = resetCapacity; window = resetWindow; }
        if (bucket == null) { chain.doFilter(request, response); return; }
        var decision = service.tryConsume(bucket + ipResolver.resolve(request), capacity, window);
        if (!decision.allowed()) { write429(response, decision.retryAfter()); return; }
        chain.doFilter(request, response);
    }

    private void write429(HttpServletResponse response, Duration retryAfter) throws IOException {
        long seconds = Math.max(1, (retryAfter.toMillis() + 999) / 1000);
        response.setStatus(429);
        response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(seconds));
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setHeader(HttpHeaders.PRAGMA, "no-cache");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"message\":\"Too many requests\"}");
    }
}
