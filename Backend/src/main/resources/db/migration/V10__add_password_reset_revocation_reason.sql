ALTER TABLE refresh_token_families DROP CONSTRAINT ck_refresh_token_families_revocation_reason;

ALTER TABLE refresh_token_families
    ADD CONSTRAINT ck_refresh_token_families_revocation_reason
    CHECK (revocation_reason IS NULL OR revocation_reason IN ('REUSED', 'LOGOUT', 'ADMIN', 'PASSWORD_RESET'));
