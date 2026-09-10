package com.example.com.englishai.backend.infrastructure.security;

import jakarta.servlet.http.HttpServletRequest;

public class ClientIpResolver {
    public String resolve(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        return remote == null || remote.isBlank() ? "unknown" : remote.trim().toLowerCase(java.util.Locale.ROOT);
    }
}
