package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.authentication.exception.RateLimitExceededException;
import com.example.com.englishai.backend.application.ports.RateLimitService;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LoginRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.VerifyEmailRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.ResendEmailVerificationRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.ResetPasswordRequest;
import com.example.com.englishai.backend.presentation.rest.auth.AuthController;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.beans.factory.annotation.Value;

import java.lang.reflect.Type;
import java.time.Duration;

@ControllerAdvice
@ConditionalOnBean(RateLimitService.class)
public class AuthenticationRateLimitBodyAdvice extends RequestBodyAdviceAdapter {
    private final RateLimitService service;
    private final RateLimitKeyGenerator keyGenerator;
    private final int capacity;
    private final Duration window;
    private final int verifyCapacity;
    private final Duration verifyWindow;
    private final int resendCapacity;
    private final Duration resetWindow;
    private final int resetCapacity;

    public AuthenticationRateLimitBodyAdvice(RateLimitService service, RateLimitKeyGenerator keyGenerator,
                                             int capacity, long window) {
        this(service, keyGenerator, capacity, window, 5, 600, 3, 5, 600);
    }

    public AuthenticationRateLimitBodyAdvice(RateLimitService service, RateLimitKeyGenerator keyGenerator,
                                             @Value("${SECURITY_RATE_LIMIT_LOGIN_ACCOUNT_CAPACITY:5}") int capacity,
                                             @Value("${SECURITY_RATE_LIMIT_LOGIN_ACCOUNT_WINDOW_SECONDS:600}") long window,
                                             @Value("${SECURITY_RATE_LIMIT_VERIFY_EMAIL_ACCOUNT_CAPACITY:5}") int verifyCapacity,
                                             @Value("${SECURITY_RATE_LIMIT_VERIFY_EMAIL_WINDOW_SECONDS:600}") long verifyWindow,
                                             @Value("${SECURITY_RATE_LIMIT_RESEND_VERIFICATION_ACCOUNT_CAPACITY:3}") int resendCapacity,
                                             @Value("${SECURITY_RATE_LIMIT_RESET_PASSWORD_ACCOUNT_CAPACITY:5}") int resetCapacity,
                                             @Value("${SECURITY_RATE_LIMIT_RESET_PASSWORD_WINDOW_SECONDS:600}") long resetWindow) {
        this.service = service; this.keyGenerator = keyGenerator;
        this.capacity = capacity; this.window = Duration.ofSeconds(window);
        this.verifyCapacity = verifyCapacity; this.verifyWindow = Duration.ofSeconds(verifyWindow);
        this.resendCapacity = resendCapacity;
        this.resetCapacity = resetCapacity; this.resetWindow = Duration.ofSeconds(resetWindow);
    }

    @Override
    public boolean supports(MethodParameter methodParameter, Type targetType,
                            Class<? extends HttpMessageConverter<?>> converterType) {
        return (targetType == LoginRequest.class || targetType == VerifyEmailRequest.class || targetType == ResendEmailVerificationRequest.class || targetType == ResetPasswordRequest.class)
                && methodParameter.getMethod() != null
                && (methodParameter.getMethod().getName().equals("login")
                    || methodParameter.getMethod().getName().equals("verifyEmail")
                    || methodParameter.getMethod().getName().equals("resendVerification")
                    || methodParameter.getMethod().getName().equals("resetPassword"))
                && AuthController.class.isAssignableFrom(methodParameter.getContainingClass())
                && methodParameter.hasMethodAnnotation(PostMapping.class);
    }

    @Override
    public Object afterBodyRead(Object body, HttpInputMessage inputMessage, MethodParameter parameter,
                                Type targetType, Class<? extends HttpMessageConverter<?>> converterType) {
        String email = body instanceof LoginRequest login ? login.email() : body instanceof VerifyEmailRequest verify ? verify.email() : body instanceof ResendEmailVerificationRequest resend ? resend.email() : ((ResetPasswordRequest) body).email();
        int accountCapacity = body instanceof LoginRequest ? capacity : body instanceof VerifyEmailRequest ? verifyCapacity : body instanceof ResendEmailVerificationRequest ? resendCapacity : resetCapacity;
        Duration accountWindow = body instanceof LoginRequest ? window : body instanceof VerifyEmailRequest ? verifyWindow : resetWindow;
        var decision = service.tryConsume(keyGenerator.accountKey(email), accountCapacity, accountWindow);
        if (!decision.allowed()) throw new RateLimitExceededException(decision.retryAfter());
        return body;
    }
}
