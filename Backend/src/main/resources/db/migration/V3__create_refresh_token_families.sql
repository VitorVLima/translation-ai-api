CREATE TABLE refresh_token_families (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE INDEX idx_refresh_token_families_user_id
    ON refresh_token_families(user_id);

CREATE INDEX idx_refresh_token_families_expires_at
    ON refresh_token_families(expires_at);

-- Existing refresh tokens predate the family table. Fail explicitly instead
-- of silently merging a family that belongs to multiple users.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM refresh_tokens
        GROUP BY family_id
        HAVING COUNT(DISTINCT user_id) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot migrate refresh token families with multiple users';
    END IF;
END $$;

INSERT INTO refresh_token_families (id, user_id, created_at, expires_at, revoked_at)
SELECT family_id, (array_agg(user_id))[1], MIN(created_at), MAX(expires_at),
       CASE WHEN BOOL_AND(revoked_at IS NOT NULL) THEN MAX(revoked_at) ELSE NULL END
FROM refresh_tokens
GROUP BY family_id;

ALTER TABLE refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_family
    FOREIGN KEY (family_id) REFERENCES refresh_token_families(id);
