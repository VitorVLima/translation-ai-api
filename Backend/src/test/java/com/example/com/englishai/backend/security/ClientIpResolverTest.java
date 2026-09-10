package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.infrastructure.security.ClientIpResolver;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class ClientIpResolverTest {
    @Test
    void shouldUseRemoteAddressAndIgnoreForwardedHeader() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn("2001:DB8::1");
        when(request.getHeader("X-Forwarded-For")).thenReturn("10.0.0.1");
        assertThat(new ClientIpResolver().resolve(request)).isEqualTo("2001:db8::1");
    }
}
