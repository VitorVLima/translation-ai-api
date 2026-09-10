ALTER TABLE refresh_tokens
    ADD COLUMN revocation_reason VARCHAR(32) NULL;

ALTER TABLE refresh_token_families
    ADD COLUMN revocation_reason VARCHAR(32) NULL;

UPDATE refresh_tokens
SET revocation_reason = 'ROTATED'
WHERE revoked_at IS NOT NULL
  AND replaced_by_id IS NOT NULL
  AND revocation_reason IS NULL;

ALTER TABLE refresh_tokens
    ADD CONSTRAINT ck_refresh_tokens_revocation_reason
    CHECK (revocation_reason IS NULL OR revocation_reason IN ('ROTATED', 'LOGOUT', 'ADMIN'));

ALTER TABLE refresh_token_families
    ADD CONSTRAINT ck_refresh_token_families_revocation_reason
    CHECK (revocation_reason IS NULL OR revocation_reason IN ('REUSED', 'LOGOUT', 'ADMIN'));
