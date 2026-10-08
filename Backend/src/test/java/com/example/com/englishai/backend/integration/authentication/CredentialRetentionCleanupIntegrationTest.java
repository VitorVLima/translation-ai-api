package com.example.com.englishai.backend.integration.authentication;

import com.example.com.englishai.backend.infrastructure.persistence.CredentialRetentionCleanup;
import java.sql.Connection;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class CredentialRetentionCleanupIntegrationTest {
    @Autowired private DataSource dataSource;

    @Test
    void deletesOnlyEligibleRecordsInBatchesAndPreservesRefreshReuseHistory() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            var isolated = new SingleConnectionDataSource(connection, true);
            var jdbc = new JdbcTemplate(isolated);
            try {
                createTemporaryTables(jdbc);
                Instant now = Instant.parse("2026-10-08T12:00:00Z");
                UUID oldFamily = UUID.randomUUID(), retainedFamily = UUID.randomUUID();
                UUID first = UUID.randomUUID(), second = UUID.randomUUID(), third = UUID.randomUUID();
                jdbc.update("insert into refresh_token_families(id,expires_at) values (?,?),(?,?)",
                        oldFamily, ts(now.minus(Duration.ofDays(61))), retainedFamily, ts(now.minus(Duration.ofDays(5))));
                // Insert replacement first because the self-reference is RESTRICT.
                jdbc.update("insert into refresh_tokens(id,family_id,expires_at) values (?,?,?)",
                        third, oldFamily, ts(now.minus(Duration.ofDays(61))));
                jdbc.update("insert into refresh_tokens(id,family_id,expires_at,replaced_by_id) values (?,?,?,?)",
                        second, oldFamily, ts(now.minus(Duration.ofDays(61))), third);
                jdbc.update("insert into refresh_tokens(id,family_id,expires_at,replaced_by_id) values (?,?,?,?)",
                        first, oldFamily, ts(now.minus(Duration.ofDays(61))), second);
                jdbc.update("insert into refresh_tokens(id,family_id,expires_at,revoked_at) values (?,?,?,?)",
                        UUID.randomUUID(), retainedFamily, ts(now.minus(Duration.ofDays(6))), ts(now.minus(Duration.ofDays(5))));
                for (int i = 0; i < 3; i++) {
                    jdbc.update("insert into email_verification_codes(id,expires_at,used_at) values (?,?,?)",
                            UUID.randomUUID(), ts(now.minus(Duration.ofDays(9))), ts(now.minus(Duration.ofDays(8))));
                    jdbc.update("insert into password_reset_codes(id,expires_at,invalidated_at) values (?,?,?)",
                            UUID.randomUUID(), ts(now.minus(Duration.ofDays(9))), ts(now.minus(Duration.ofDays(8))));
                }
                jdbc.update("insert into email_verification_codes(id,expires_at,used_at) values (?,?,?)",
                        UUID.randomUUID(), ts(now.minus(Duration.ofDays(6))), ts(now.minus(Duration.ofDays(5))));
                jdbc.update("insert into password_reset_codes(id,expires_at) values (?,?)",
                        UUID.randomUUID(), ts(now.minus(Duration.ofDays(6))));

                var cleanup = new CredentialRetentionCleanup(isolated, new DataSourceTransactionManager(isolated),
                        Clock.fixed(now, ZoneOffset.UTC), 1, 2, Duration.ofDays(7), Duration.ofDays(30));
                assertThat(cleanup.runOnce()).isEqualTo(new CredentialRetentionCleanup.Counts(2, 2, 2, 0));
                assertThat(count(jdbc, "refresh_tokens")).isEqualTo(2);
                assertThat(cleanup.runOnce()).isEqualTo(new CredentialRetentionCleanup.Counts(1, 1, 1, 1));
                assertThat(cleanup.runOnce()).isEqualTo(new CredentialRetentionCleanup.Counts(0, 0, 0, 0));
                assertThat(count(jdbc, "email_verification_codes")).isEqualTo(1);
                assertThat(count(jdbc, "password_reset_codes")).isEqualTo(1);
                assertThat(count(jdbc, "refresh_tokens")).isEqualTo(1);
                assertThat(count(jdbc, "refresh_token_families")).isEqualTo(1);
                assertThat(jdbc.queryForObject("select count(*) from refresh_tokens where family_id=?", Integer.class,
                        retainedFamily)).isEqualTo(1);
            } finally {
                jdbc.execute("drop table if exists pg_temp.refresh_tokens");
                jdbc.execute("drop table if exists pg_temp.refresh_token_families");
                jdbc.execute("drop table if exists pg_temp.email_verification_codes");
                jdbc.execute("drop table if exists pg_temp.password_reset_codes");
            }
        }
    }

    private static void createTemporaryTables(JdbcTemplate jdbc) {
        jdbc.execute("create temp table refresh_token_families(id uuid primary key, expires_at timestamptz not null)");
        jdbc.execute("create temp table refresh_tokens(id uuid primary key, family_id uuid not null references refresh_token_families(id), "
                + "expires_at timestamptz not null, revoked_at timestamptz, "
                + "replaced_by_id uuid references refresh_tokens(id) on delete restrict)");
        jdbc.execute("create index on refresh_tokens(replaced_by_id)");
        jdbc.execute("create temp table email_verification_codes(id uuid primary key, expires_at timestamptz not null, used_at timestamptz)");
        jdbc.execute("create temp table password_reset_codes(id uuid primary key, expires_at timestamptz not null, invalidated_at timestamptz)");
    }

    private static int count(JdbcTemplate jdbc, String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    private static Timestamp ts(Instant value) { return Timestamp.from(value); }
}
