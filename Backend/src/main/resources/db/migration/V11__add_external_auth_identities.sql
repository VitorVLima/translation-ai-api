ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE external_auth_identities (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uk_external_identity_provider_subject UNIQUE (provider, provider_subject)
);

CREATE INDEX idx_external_auth_identities_user_id ON external_auth_identities(user_id);
