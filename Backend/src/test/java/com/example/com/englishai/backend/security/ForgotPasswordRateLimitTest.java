package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.application.authentication.exception.RateLimitExceededException;
import com.example.com.englishai.backend.infrastructure.security.AuthenticationRateLimitBodyAdvice;
import com.example.com.englishai.backend.infrastructure.security.AuthenticationRateLimitFilter;
import com.example.com.englishai.backend.infrastructure.security.ClientIpResolver;
import com.example.com.englishai.backend.infrastructure.security.LocalBucketRateLimitService;
import com.example.com.englishai.backend.infrastructure.security.RateLimitKeyGenerator;
import com.example.com.englishai.backend.presentation.rest.auth.AuthController;
import com.example.com.englishai.backend.presentation.rest.auth.dto.ForgotPasswordRequest;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.lang.reflect.Method;
import java.time.Duration;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ForgotPasswordRateLimitTest {
    @Test
    void limitsRequestsPerIpBeforeReachingController() throws Exception {
        var rates = new LocalBucketRateLimitService(100, Duration.ofMinutes(15));
        var filter = new AuthenticationRateLimitFilter(rates, new ClientIpResolver(),
                10, Duration.ofMinutes(10), 3, Duration.ofMinutes(10),
                30, Duration.ofMinutes(1), 30, Duration.ofMinutes(1),
                10, Duration.ofMinutes(10), 5, Duration.ofMinutes(10),
                10, Duration.ofMinutes(10), 2, Duration.ofMinutes(10),
                10, Duration.ofMinutes(10));

        assertThat(request(filter, "192.0.2.1").getStatus()).isEqualTo(200);
        assertThat(request(filter, "192.0.2.1").getStatus()).isEqualTo(200);
        var denied = request(filter, "192.0.2.1");
        assertThat(denied.getStatus()).isEqualTo(429);
        assertThat(denied.getHeader("Retry-After")).isNotBlank();
        assertThat(request(filter, "192.0.2.2").getStatus()).isEqualTo(200);
    }

    @Test
    void limitsNormalizedAccountIndependentlyOfIp() throws Exception {
        var rates = new LocalBucketRateLimitService(100, Duration.ofMinutes(15));
        var advice = new AuthenticationRateLimitBodyAdvice(rates,
                new RateLimitKeyGenerator(Base64.getEncoder().encodeToString(new byte[32])), 5, 600);
        Method method = AuthController.class.getMethod("forgotPassword", ForgotPasswordRequest.class);
        MethodParameter parameter = new MethodParameter(method, 0);

        for (int i = 0; i < 3; i++) {
            advice.afterBodyRead(new ForgotPasswordRequest(i == 0 ? " USER@EXAMPLE.COM " : "user@example.com"),
                    null, parameter, ForgotPasswordRequest.class, MappingJackson2HttpMessageConverter.class);
        }
        assertThatThrownBy(() -> advice.afterBodyRead(new ForgotPasswordRequest("user@example.com"),
                null, parameter, ForgotPasswordRequest.class, MappingJackson2HttpMessageConverter.class))
                .isInstanceOf(RateLimitExceededException.class);
        advice.afterBodyRead(new ForgotPasswordRequest("other@example.com"),
                null, parameter, ForgotPasswordRequest.class, MappingJackson2HttpMessageConverter.class);
    }

    @Test
    void resetAndValidationHaveIndependentIpBuckets() throws Exception {
        var rates = new LocalBucketRateLimitService(100, Duration.ofMinutes(15));
        var filter = new AuthenticationRateLimitFilter(rates, new ClientIpResolver(),
                10, Duration.ofMinutes(10), 3, Duration.ofMinutes(10),
                30, Duration.ofMinutes(1), 30, Duration.ofMinutes(1),
                10, Duration.ofMinutes(10), 5, Duration.ofMinutes(10),
                1, Duration.ofMinutes(10), 2, Duration.ofMinutes(10),
                10, Duration.ofMinutes(10));
        assertThat(request(filter, "192.0.2.3", "/api/v1/auth/reset-password").getStatus()).isEqualTo(200);
        assertThat(request(filter, "192.0.2.3", "/api/v1/auth/validate-reset-code").getStatus()).isEqualTo(200);
        assertThat(request(filter, "192.0.2.3", "/api/v1/auth/reset-password").getStatus()).isEqualTo(429);
    }

    private static MockHttpServletResponse request(AuthenticationRateLimitFilter filter, String ip) throws Exception {
        return request(filter, ip, "/api/v1/auth/forgot-password");
    }

    private static MockHttpServletResponse request(AuthenticationRateLimitFilter filter, String ip, String path) throws Exception {
        var request = new MockHttpServletRequest("POST", path);
        request.setRemoteAddr(ip);
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
