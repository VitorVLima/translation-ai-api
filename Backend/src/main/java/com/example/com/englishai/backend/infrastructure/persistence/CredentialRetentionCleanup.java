package com.example.com.englishai.backend.infrastructure.persistence;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Deletes only records past their security retention window, in small transactions. */
public final class CredentialRetentionCleanup {
    private static final Logger LOG = LoggerFactory.getLogger(CredentialRetentionCleanup.class);
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final int batchSize;
    private final int maxBatches;
    private final Duration codeRetention;
    private final Duration familyRetention;

    public CredentialRetentionCleanup(DataSource dataSource, PlatformTransactionManager transactionManager,
                                      Clock clock, int batchSize, int maxBatches,
                                      Duration codeRetention, Duration familyRetention) {
        if (batchSize < 1 || batchSize > 1000 || maxBatches < 1 || maxBatches > 1000
                || codeRetention.isZero() || codeRetention.isNegative()
                || familyRetention.isZero() || familyRetention.isNegative()) {
            throw new IllegalArgumentException("Invalid credential cleanup limits");
        }
        this.jdbc = new JdbcTemplate(dataSource);
        this.transactions = new TransactionTemplate(transactionManager);
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = clock;
        this.batchSize = batchSize;
        this.maxBatches = maxBatches;
        this.codeRetention = codeRetention;
        this.familyRetention = familyRetention;
    }

    @Scheduled(cron = "${security.retention.cleanup-cron:0 17 3 * * *}", zone = "UTC")
    public void scheduled() {
        try {
            Counts counts = runOnce();
            LOG.info("CREDENTIAL_CLEANUP status=success verification={} reset={} tokens={} families={}",
                    counts.verification(), counts.reset(), counts.tokens(), counts.families());
        } catch (RuntimeException exception) {
            LOG.warn("CREDENTIAL_CLEANUP status=failed reason={}", exception.getClass().getSimpleName());
        }
    }

    public Counts runOnce() {
        Instant now = clock.instant();
        Timestamp codeCutoff = Timestamp.from(now.minus(codeRetention));
        Timestamp familyCutoff = Timestamp.from(now.minus(familyRetention));
        int verification = drain(() -> deleteCodes("email_verification_codes", codeCutoff));
        int reset = drain(() -> deleteCodes("password_reset_codes", codeCutoff));
        int tokens = drain(() -> deleteTokenBatch(familyCutoff));
        int families = drain(() -> deleteFamilyBatch(familyCutoff));
        return new Counts(verification, reset, tokens, families);
    }

    private int drain(java.util.function.IntSupplier operation) {
        int deleted = 0;
        for (int batch = 0; batch < maxBatches; batch++) {
            int count = transactions.execute(status -> operation.getAsInt());
            deleted += count;
            if (count == 0) break;
        }
        return deleted;
    }

    private int deleteCodes(String table, Timestamp cutoff) {
        // The table name is selected internally from two fixed literals.
        return jdbc.update("delete from " + table + " where id in (select id from " + table
                + " where expires_at < ? order by expires_at, id limit ? for update skip locked)",
                cutoff, batchSize);
    }

    private int deleteTokenBatch(Timestamp cutoff) {
        // A token is removed only after its whole family passed retention. Deleting
        // predecessor-free rows respects the replacement self-FK without mass DELETE.
        return jdbc.update("delete from refresh_tokens where id in ("
                + "select token.id from refresh_tokens token "
                + "join refresh_token_families family on family.id = token.family_id "
                + "where family.expires_at < ? and not exists ("
                + "select 1 from refresh_tokens predecessor where predecessor.replaced_by_id = token.id) "
                + "order by token.expires_at, token.id limit ? for update of token skip locked)",
                cutoff, batchSize);
    }

    private int deleteFamilyBatch(Timestamp cutoff) {
        return jdbc.update("delete from refresh_token_families where id in ("
                + "select family.id from refresh_token_families family "
                + "where family.expires_at < ? and not exists ("
                + "select 1 from refresh_tokens token where token.family_id = family.id) "
                + "order by family.expires_at, family.id limit ? for update of family skip locked)",
                cutoff, batchSize);
    }

    public record Counts(int verification, int reset, int tokens, int families) {}
}
