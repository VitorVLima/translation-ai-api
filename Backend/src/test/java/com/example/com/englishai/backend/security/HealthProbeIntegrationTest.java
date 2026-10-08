package com.example.com.englishai.backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthContributor;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.boot.health.registry.HealthContributorRegistry;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class HealthProbeIntegrationTest {
    @Autowired private MockMvc mvc;
    @Autowired private HealthContributorRegistry contributors;

    @Test
    void anonymousProbesAreMinimalAndOtherActuatorEndpointsAreUnavailable() throws Exception {
        for (String path : new String[]{"/livez", "/readyz", "/actuator/health/liveness", "/actuator/health/readiness"}) {
            mvc.perform(get(path)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("UP"))
                    .andExpect(result -> {
                        String body = result.getResponse().getContentAsString();
                        assertThat(body).doesNotContain("components", "details", "password", "secret", "jdbc:");
                    });
        }
        for (String path : new String[]{"/actuator", "/actuator/health", "/actuator/health/db",
                "/actuator/env", "/actuator/configprops", "/actuator/metrics"}) {
            mvc.perform(get(path)).andExpect(result ->
                    assertThat(result.getResponse().getStatus()).isNotEqualTo(200));
        }
    }

    @Test
    void unavailableDatabaseRemovesReadinessButNeverLiveness() throws Exception {
        HealthContributor original = contributors.unregisterContributor("db");
        assertThat(original).isNotNull();
        try {
            contributors.registerContributor("db", (HealthIndicator) () ->
                    Health.down().withDetail("secret", "must-not-appear").build());
            mvc.perform(get("/readyz")).andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.status").value("DOWN"))
                    .andExpect(result -> assertThat(result.getResponse().getContentAsString())
                            .doesNotContain("must-not-appear", "secret", "components"));
            mvc.perform(get("/livez")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("UP"));
        } finally {
            contributors.unregisterContributor("db");
            contributors.registerContributor("db", original);
        }
    }

    @Test
    void unavailableOptionalProviderDoesNotChangeReadinessOrLiveness() throws Exception {
        contributors.registerContributor("llm", (HealthIndicator) () -> Health.down().build());
        try {
            mvc.perform(get("/readyz")).andExpect(status().isOk());
            mvc.perform(get("/livez")).andExpect(status().isOk());
        } finally {
            contributors.unregisterContributor("llm");
        }
    }
}
