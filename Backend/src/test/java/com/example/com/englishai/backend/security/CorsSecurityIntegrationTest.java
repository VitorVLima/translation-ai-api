package com.example.com.englishai.backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.cors.CorsConfigurationSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "APP_CORS_ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:5501,http://192.0.2.44:5500")
@AutoConfigureMockMvc
class CorsSecurityIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired CorsConfigurationSource corsConfigurationSource;

    @Test
    void allowsConfiguredDevelopmentOriginAndAuthorizationHeader() throws Exception {
        mvc.perform(options("/api/v1/users/me")
                        .header("Origin", "http://localhost:5500")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "Authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5500"))
                .andExpect(header().string("Access-Control-Allow-Headers", org.hamcrest.Matchers.containsString("Authorization")));
    }

    @Test
    void allowsLoopbackIpDevelopmentOrigin() throws Exception {
        mvc.perform(options("/api/v1/auth/login")
                        .header("Origin", "http://127.0.0.1:5500")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://127.0.0.1:5500"));
    }

    @Test
    void allowsConfiguredLanOriginForLoginPreflight() throws Exception {
        mvc.perform(options("/api/v1/auth/login")
                        .header("Origin", "http://192.0.2.44:5500")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://192.0.2.44:5500"))
                .andExpect(header().string("Access-Control-Allow-Methods", org.hamcrest.Matchers.containsString("POST")))
                .andExpect(header().string("Access-Control-Allow-Headers", org.hamcrest.Matchers.containsString("Content-Type")));
    }

    @Test
    void allowsAdminUiOriginAndPreflightForAdminRequest() throws Exception {
        mvc.perform(options("/api/v1/admin/dashboard")
                        .header("Origin", "http://localhost:5501")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "Authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5501"))
                .andExpect(header().string("Access-Control-Allow-Methods", org.hamcrest.Matchers.containsString("GET")));
    }

    @Test
    void allowsPatchPreflightForRoleManagement() throws Exception {
        mvc.perform(options("/api/v1/admin/users/00000000-0000-0000-0000-000000000001/role")
                        .header("Origin", "http://localhost:5501")
                        .header("Access-Control-Request-Method", "PATCH")
                        .header("Access-Control-Request-Headers", "Authorization,Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5501"))
                .andExpect(header().string("Access-Control-Allow-Methods", org.hamcrest.Matchers.containsString("PATCH")));
    }

    @Test
    void realAdminRequestWithoutAuthenticationRemainsUnauthorized() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/admin/dashboard"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsUnknownAndUnconfiguredLanOrigins() throws Exception {
        mvc.perform(options("/api/v1/auth/login")
                        .header("Origin", "http://evil.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));

        mvc.perform(options("/api/v1/auth/login")
                        .header("Origin", "http://192.0.2.45:5500")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void usesOnlyExactOriginsWithoutWildcardsOrCredentials() {
        var configuration = corsConfigurationSource.getCorsConfiguration(
                new MockHttpServletRequest("OPTIONS", "/api/v1/auth/login"));

        assertThat(configuration.getAllowedOrigins())
                .containsExactly("http://localhost:5500", "http://127.0.0.1:5500",
                        "http://localhost:5501", "http://192.0.2.44:5500")
                .doesNotContain("*");
        assertThat(configuration.getAllowedOriginPatterns()).isNull();
        assertThat(configuration.getAllowCredentials()).isFalse();
    }
}
