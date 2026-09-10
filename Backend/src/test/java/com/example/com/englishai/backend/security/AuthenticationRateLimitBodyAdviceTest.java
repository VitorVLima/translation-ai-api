package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.application.ports.RateLimitService;
import com.example.com.englishai.backend.infrastructure.security.AuthenticationRateLimitBodyAdvice;
import com.example.com.englishai.backend.infrastructure.security.RateLimitKeyGenerator;
import com.example.com.englishai.backend.presentation.rest.auth.AuthController;
import com.example.com.englishai.backend.presentation.rest.auth.dto.LoginRequest;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.bind.annotation.PostMapping;

import java.lang.reflect.Method;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

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
