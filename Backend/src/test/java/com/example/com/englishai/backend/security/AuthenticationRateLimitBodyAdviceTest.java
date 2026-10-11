package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.application.ports.RateLimitService;
import com.example.com.englishai.backend.infrastructure.security.AuthenticationRateLimitBodyAdvice;
import com.example.com.englishai.backend.infrastructure.security.RateLimitKeyGenerator;
import com.example.com.englishai.backend.infrastructure.security.LocalBucketRateLimitService;
import com.example.com.englishai.backend.presentation.rest.auth.AuthController;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LoginRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.ValidatePasswordResetCodeRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.ForgotPasswordRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.VerifyEmailRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.ResendEmailVerificationRequest;
import com.example.com.englishai.backend.presentation.rest.auth.dto.ResetPasswordRequest;
import com.example.com.englishai.backend.application.authentication.exception.RateLimitExceededException;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.bind.annotation.PostMapping;

import java.lang.reflect.Method;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AuthenticationRateLimitBodyAdviceTest {
    private final AuthenticationRateLimitBodyAdvice advice = new AuthenticationRateLimitBodyAdvice(
            (key, capacity, window) -> RateLimitService.RateLimitDecision.permitted(),
            new RateLimitKeyGenerator(Base64.getEncoder().encodeToString(new byte[32])), 5, 600);

    @Test
    void shouldApplyOnlyToAuthControllerLogin() throws Exception {
        Method login = AuthController.class.getMethod("login", LoginRequest.class);
        assertThat(advice.supports(new MethodParameter(login, 0), LoginRequest.class,
                MappingJackson2HttpMessageConverter.class)).isTrue();
    }

    @Test
    void shouldApplyToPasswordResetCodeValidation() throws Exception {
        Method validation = AuthController.class.getMethod("validateResetCode", ValidatePasswordResetCodeRequest.class);
        assertThat(advice.supports(new MethodParameter(validation, 0), ValidatePasswordResetCodeRequest.class,
                MappingJackson2HttpMessageConverter.class)).isTrue();
    }

    @Test
    void shouldApplySeparateNormalizedAccountLimitToForgotPassword() throws Exception {
        Method forgot = AuthController.class.getMethod("forgotPassword", ForgotPasswordRequest.class);
        assertThat(advice.supports(new MethodParameter(forgot, 0), ForgotPasswordRequest.class,
                MappingJackson2HttpMessageConverter.class)).isTrue();
        AtomicReference<String> key = new AtomicReference<>();
        AuthenticationRateLimitBodyAdvice recording = new AuthenticationRateLimitBodyAdvice(
                (bucket, capacity, window) -> {
                    key.set(bucket);
                    assertThat(capacity).isEqualTo(3);
                    return RateLimitService.RateLimitDecision.permitted();
                }, new RateLimitKeyGenerator(Base64.getEncoder().encodeToString(new byte[32])), 5, 600);
        recording.afterBodyRead(new ForgotPasswordRequest(" User@Test.COM "), null,
                new MethodParameter(forgot, 0), ForgotPasswordRequest.class,
                MappingJackson2HttpMessageConverter.class);
        String first = key.get();
        recording.afterBodyRead(new ForgotPasswordRequest("user@test.com"), null,
                new MethodParameter(forgot, 0), ForgotPasswordRequest.class,
                MappingJackson2HttpMessageConverter.class);
        assertThat(key.get()).isEqualTo(first).startsWith("forgot-password:account:")
                .doesNotContain("user@test.com");
    }

    @Test
    void exhaustingVerificationDoesNotConsumeOtherAccountBuckets() throws Exception {
        var separate = new AuthenticationRateLimitBodyAdvice(
                new LocalBucketRateLimitService(100, Duration.ofMinutes(15)),
                new RateLimitKeyGenerator(Base64.getEncoder().encodeToString(new byte[32])), 5, 600);
        for (int attempt = 0; attempt < 5; attempt++) {
            apply(separate, "verifyEmail", VerifyEmailRequest.class,
                    new VerifyEmailRequest("same@example.com", "000000"));
        }
        assertThatThrownBy(() -> apply(separate, "verifyEmail", VerifyEmailRequest.class,
                new VerifyEmailRequest("same@example.com", "000000")))
                .isInstanceOf(RateLimitExceededException.class);

        apply(separate, "login", LoginRequest.class, new LoginRequest("same@example.com", "unused"));
        apply(separate, "resendVerification", ResendEmailVerificationRequest.class,
                new ResendEmailVerificationRequest("same@example.com"));
        apply(separate, "forgotPassword", ForgotPasswordRequest.class,
                new ForgotPasswordRequest("same@example.com"));
        apply(separate, "resetPassword", ResetPasswordRequest.class,
                new ResetPasswordRequest("same@example.com", "000000", "unused-password"));
        apply(separate, "validateResetCode", ValidatePasswordResetCodeRequest.class,
                new ValidatePasswordResetCodeRequest("same@example.com", "000000"));
    }

    private static void apply(AuthenticationRateLimitBodyAdvice advice, String method,
                              Class<?> requestType, Object body) throws Exception {
        Method target = AuthController.class.getMethod(method, requestType);
        advice.afterBodyRead(body, null, new MethodParameter(target, 0), requestType,
                MappingJackson2HttpMessageConverter.class);
    }

    @Test
    void shouldNotApplyToAnotherEndpointUsingLoginRequest() throws Exception {
        Method other = OtherAuthController.class.getDeclaredMethod("other", LoginRequest.class);
        assertThat(advice.supports(new MethodParameter(other, 0), LoginRequest.class,
                MappingJackson2HttpMessageConverter.class)).isFalse();
    }

    static class OtherAuthController extends AuthController {
        OtherAuthController() { super(null, null, null, null); }

        @PostMapping("/other")
        void other(LoginRequest request) { }
    }
}
