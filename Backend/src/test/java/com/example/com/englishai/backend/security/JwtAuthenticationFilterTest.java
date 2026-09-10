package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.application.authentication.exception.InvalidAuthenticationTokenException;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.infrastructure.security.JwtAuthenticationFilter;
import com.example.com.englishai.backend.infrastructure.security.UnauthorizedEntryPoint;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class JwtAuthenticationFilterTest {

    private final AuthenticationTokenValidator validator = mock(AuthenticationTokenValidator.class);
    private final JwtAuthenticationFilter filter = new JwtAuthenticationFilter(validator, new UnauthorizedEntryPoint());
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private final MockHttpServletResponse response = new MockHttpServletResponse();
    private final FilterChain chain = mock(FilterChain.class);

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "Basic ignored", "BearerOther ignored"})
    void shouldContinueWithoutBearerToken(String header) throws Exception {
        if (header != null) {
            request.addHeader("Authorization", header);
        }

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        verifyNoInteractions(validator);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Bearer test-token", "bearer test-token"})
    void shouldAuthenticateWithValidatedUuidAndNoCredentials(String header) throws Exception {
        UUID userId = UUID.randomUUID();
        request.addHeader("Authorization", header);
        when(validator.validateAndGetUserId("test-token")).thenReturn(userId);
        doAnswer(invocation -> {
            var authentication = SecurityContextHolder.getContext().getAuthentication();
            assertThat(authentication.isAuthenticated()).isTrue();
            assertThat(authentication.getPrincipal()).isEqualTo(userId);
            assertThat(authentication.getCredentials()).isNull();
            assertThat(authentication.getAuthorities()).isEmpty();
            return null;
        }).when(chain).doFilter(request, response);

        filter.doFilter(request, response, chain);

        verify(validator).validateAndGetUserId("test-token");
        verify(chain).doFilter(request, response);
        assertThat(request.getSession(false)).isNull();
    }

    @Test
    void shouldRejectInvalidTokenAndClearExistingContext() throws Exception {
        request.addHeader("Authorization", "Bearer invalid-token");
        when(validator.validateAndGetUserId("invalid-token"))
                .thenThrow(new InvalidAuthenticationTokenException());
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(UUID.randomUUID(), null, List.of()));

        filter.doFilter(request, response, chain);

        assertUnauthorized();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Bearer", "Bearer ", "Bearer    "})
    void shouldRejectEmptyBearerToken(String header) throws Exception {
        request.addHeader("Authorization", header);

        filter.doFilter(request, response, chain);

        assertUnauthorized();
        verifyNoInteractions(validator);
    }

    private void assertUnauthorized() throws Exception {
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).isEqualTo("{\"message\":\"Unauthorized\"}");
        assertThat(response.getHeader("WWW-Authenticate")).isEqualTo("Bearer");
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(request.getSession(false)).isNull();
        verifyNoInteractions(chain);
    }
}
