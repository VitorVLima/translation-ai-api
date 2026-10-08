package com.example.com.englishai.backend.infrastructure.persistence;

import java.time.Clock;
import java.time.Duration;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "security.retention.enabled", havingValue = "true")
public class CredentialRetentionConfig {
    @Bean
    CredentialRetentionCleanup credentialRetentionCleanup(
            DataSource dataSource, PlatformTransactionManager transactionManager,
            @Qualifier("refreshTokenClock") Clock clock,
            @Value("${security.retention.batch-size:200}") int batchSize,
            @Value("${security.retention.max-batches-per-table:10}") int maxBatches,
            @Value("${security.retention.code-days-after-expiry:7}") long codeDays,
            @Value("${security.retention.family-days-after-expiry:30}") long familyDays) {
        if (codeDays < 1 || familyDays < 1) {
            throw new IllegalArgumentException("Credential retention periods must be positive");
        }
        return new CredentialRetentionCleanup(dataSource, transactionManager, clock,
                batchSize, maxBatches, Duration.ofDays(codeDays), Duration.ofDays(familyDays));
    }
}
