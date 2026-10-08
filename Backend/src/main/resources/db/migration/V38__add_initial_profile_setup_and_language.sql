ALTER TABLE user_profiles
    ADD COLUMN preferred_language VARCHAR(8) NOT NULL DEFAULT 'pt-BR',
    ADD COLUMN initial_setup_completed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_profiles
    ADD CONSTRAINT ck_profile_preferred_language
        CHECK (preferred_language IN ('pt-BR', 'en'));
