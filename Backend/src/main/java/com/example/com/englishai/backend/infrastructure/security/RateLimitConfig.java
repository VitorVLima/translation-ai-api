package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.ports.RateLimitService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class RateLimitConfig {
    @Bean public AiWorkloadLimiter aiWorkloadLimiter(
            @Value("${AI_RATE_CACHE_MAX_SIZE:10000}") long cacheMax,
            @Value("${AI_LLM_PER_HOUR:30}") int llmHour,
            @Value("${AI_LLM_PER_OPERATION_MINUTE:6}") int llmMinute,
            @Value("${AI_AUDIO_PER_OPERATION_MINUTE:12}") int audioMinute,
            @Value("${AI_AUDIO_PER_HOUR:120}") int audioHour,
            @Value("${AI_LLM_PER_USER_CONCURRENT:2}") int userLlm,
            @Value("${AI_LLM_GLOBAL_CONCURRENT:8}") int globalLlm,
            @Value("${AI_STT_GLOBAL_CONCURRENT:2}") int globalStt,
            @Value("${AI_TTS_GLOBAL_CONCURRENT:2}") int globalTts,
            @Value("${AI_SSE_GLOBAL_CONCURRENT:6}") int globalStreams) {
        return new AiWorkloadLimiter(new LocalBucketRateLimitService(cacheMax, Duration.ofHours(2)),
                llmHour, llmMinute, audioMinute, audioHour, userLlm, globalLlm,
                globalStt, globalTts, globalStreams);
    }
    @Bean public AiWorkloadFilter aiWorkloadFilter(AiWorkloadLimiter limiter) {
        return new AiWorkloadFilter(limiter);
    }
    @Bean public org.springframework.boot.web.servlet.FilterRegistrationBean<AiWorkloadFilter> aiWorkloadFilterRegistration(
            AiWorkloadFilter filter) {
        var registration = new org.springframework.boot.web.servlet.FilterRegistrationBean<>(filter);
        registration.setEnabled(false); // Security chain runs this after JWT authentication.
        return registration;
    }
    @Bean public SseStreamExecutor sseStreamExecutor(
            @Value("${AI_SSE_THREADS:4}") int threads,
            @Value("${AI_SSE_QUEUE_SIZE:2}") int queueSize) {
        return new SseStreamExecutor(threads, queueSize);
    }
    @Bean public ClientIpResolver clientIpResolver() { return new ClientIpResolver(); }
    @Bean public RateLimitService rateLimitService(
            @Value("${SECURITY_RATE_LIMIT_CACHE_MAX_SIZE:10000}") long max,
            @Value("${SECURITY_RATE_LIMIT_CACHE_TTL_SECONDS:900}") long ttl) {
        return new LocalBucketRateLimitService(max, Duration.ofSeconds(ttl));
    }
    @Bean public RateLimitKeyGenerator rateLimitKeyGenerator(
            @Value("${SECURITY_RATE_LIMIT_KEY_SECRET:}") String secret) {
        return new RateLimitKeyGenerator(secret);
    }
    @Bean public AuthenticationRateLimitFilter authenticationRateLimitFilter(
            RateLimitService service, ClientIpResolver resolver,
            @Value("${SECURITY_RATE_LIMIT_LOGIN_CAPACITY:10}") int loginCap,
            @Value("${SECURITY_RATE_LIMIT_LOGIN_WINDOW_SECONDS:600}") long loginWindow,
            @Value("${SECURITY_RATE_LIMIT_REGISTER_CAPACITY:3}") int registerCap,
            @Value("${SECURITY_RATE_LIMIT_REGISTER_WINDOW_SECONDS:600}") long registerWindow,
            @Value("${SECURITY_RATE_LIMIT_REFRESH_CAPACITY:30}") int refreshCap,
            @Value("${SECURITY_RATE_LIMIT_REFRESH_WINDOW_SECONDS:60}") long refreshWindow,
            @Value("${SECURITY_RATE_LIMIT_LOGOUT_CAPACITY:30}") int logoutCap,
            @Value("${SECURITY_RATE_LIMIT_LOGOUT_WINDOW_SECONDS:60}") long logoutWindow,
            @Value("${SECURITY_RATE_LIMIT_VERIFY_EMAIL_IP_CAPACITY:10}") int verifyEmailCap,
            @Value("${SECURITY_RATE_LIMIT_VERIFY_EMAIL_WINDOW_SECONDS:600}") long verifyEmailWindow,
            @Value("${SECURITY_RATE_LIMIT_RESEND_VERIFICATION_IP_CAPACITY:5}") int resendCap,
            @Value("${SECURITY_RATE_LIMIT_RESEND_VERIFICATION_WINDOW_SECONDS:600}") long resendWindow,
            @Value("${SECURITY_RATE_LIMIT_RESET_PASSWORD_IP_CAPACITY:10}") int resetCap,
            @Value("${SECURITY_RATE_LIMIT_RESET_PASSWORD_WINDOW_SECONDS:600}") long resetWindow,
            @Value("${SECURITY_RATE_LIMIT_GOOGLE_LOGIN_CAPACITY:10}") int googleCap,
            @Value("${SECURITY_RATE_LIMIT_GOOGLE_LOGIN_WINDOW_SECONDS:600}") long googleWindow) {
        return new AuthenticationRateLimitFilter(service, resolver, loginCap, Duration.ofSeconds(loginWindow),
                registerCap, Duration.ofSeconds(registerWindow), refreshCap, Duration.ofSeconds(refreshWindow),
                logoutCap, Duration.ofSeconds(logoutWindow), verifyEmailCap, Duration.ofSeconds(verifyEmailWindow),
                resendCap, Duration.ofSeconds(resendWindow), resetCap, Duration.ofSeconds(resetWindow),
                googleCap, Duration.ofSeconds(googleWindow));
    }
}
