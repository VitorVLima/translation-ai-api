CREATE TABLE email_verification_codes (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL,
    CONSTRAINT email_verification_codes_attempts_check CHECK (attempts >= 0 AND attempts <= max_attempts),
    CONSTRAINT email_verification_codes_max_attempts_check CHECK (max_attempts > 0)
);

CREATE INDEX idx_email_verification_codes_user_id ON email_verification_codes(user_id);
CREATE INDEX idx_email_verification_codes_expires_at ON email_verification_codes(expires_at);
