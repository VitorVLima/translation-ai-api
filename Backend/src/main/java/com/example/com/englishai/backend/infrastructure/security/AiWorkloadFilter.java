package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.authentication.exception.RateLimitExceededException;
import com.example.com.englishai.backend.infrastructure.security.AiWorkloadLimiter.Operation;
import jakarta.servlet.AsyncEvent;
import jakarta.servlet.AsyncListener;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public final class AiWorkloadFilter extends OncePerRequestFilter {
    private static final System.Logger LOG = System.getLogger(AiWorkloadFilter.class.getName());
    private final AiWorkloadLimiter limiter;
    public AiWorkloadFilter(AiWorkloadLimiter limiter) { this.limiter = limiter; }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var principal = SecurityContextHolder.getContext().getAuthentication();
        var operation = operation(request.getMethod(), request.getRequestURI());
        if (operation == null || principal == null || !(principal.getPrincipal() instanceof UUID user)) {
            chain.doFilter(request, response); return;
        }
        boolean stream = request.getRequestURI().endsWith("/stream");
        AiWorkloadLimiter.Lease lease;
        try { lease = limiter.admit(user, operation, stream); }
        catch (RateLimitExceededException denied) {
            LOG.log(System.Logger.Level.INFO, "AI admission rejected operation={0} streams={1}", operation, limiter.activeStreams());
            reject(response, denied.getRetryAfter()); return;
        }
        try {
            chain.doFilter(request, response);
            if (request.isAsyncStarted()) {
                try { request.getAsyncContext().addListener(new AsyncListener() {
                    @Override public void onComplete(AsyncEvent event) { lease.close(); }
                    @Override public void onTimeout(AsyncEvent event) { lease.close(); }
                    @Override public void onError(AsyncEvent event) { lease.close(); }
                    @Override public void onStartAsync(AsyncEvent event) { event.getAsyncContext().addListener(this); }
                }); } catch (IllegalStateException alreadyCompleted) { lease.close(); }
            } else lease.close();
        } catch (Throwable failure) {
            lease.close();
            throw failure;
        }
    }

    static Operation operation(String method, String path) {
        if ("POST".equals(method)) {
            if (path.equals("/api/v1/chat")) return Operation.CHAT;
            if (path.equals("/api/v1/chat/stream")) return Operation.SSE;
            if (path.equals("/api/v1/conversations")) return Operation.CONVERSATION;
            if (path.matches("/api/v1/conversations/[^/]+/messages/stream")) return Operation.SSE;
            if (path.matches("/api/v1/conversations/[^/]+/messages")) return Operation.CONVERSATION;
            if (path.matches("/api/v1/conversations/[^/]+/complete")) return Operation.EVALUATION;
            if (path.equals("/api/v1/reading/generate") || path.equals("/api/v1/reading/hint")
                    || path.equals("/api/v1/reading/questions")) return Operation.READING;
            if (path.equals("/api/v1/translate") || path.equals("/api/v1/correct")
                    || path.equals("/api/v1/correct/explain")) return Operation.TRANSLATION;
            if (path.equals("/api/v1/vocabulary/evaluate")) return Operation.VOCABULARY;
            if (path.equals("/api/v1/transcriptions")) return Operation.STT;
            if (path.equals("/api/v1/speech")) return Operation.TTS;
        }
        if ("GET".equals(method)) {
            if (path.equals("/api/v1/vocabulary/today")) return Operation.VOCABULARY;
            if (path.matches("/api/v1/reading/[^/]+/hints")) return Operation.READING;
            if (path.equals("/api/v1/admin/tts/voices")) return Operation.TTS;
        }
        return null;
    }

    private static void reject(HttpServletResponse response, Duration retry) throws IOException {
        response.setStatus(429);
        response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(Math.max(1, (retry.toMillis() + 999) / 1000)));
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"message\":\"Too many requests\"}");
    }
}
