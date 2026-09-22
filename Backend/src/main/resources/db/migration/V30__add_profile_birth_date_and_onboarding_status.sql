ALTER TABLE user_profiles ADD COLUMN birth_date DATE;
ALTER TABLE user_profiles ADD COLUMN onboarding_status VARCHAR(16) NOT NULL DEFAULT 'PENDING';

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS ck_profile_age;
ALTER TABLE user_profiles DROP COLUMN age;
ALTER TABLE user_profiles DROP COLUMN onboarding_completed;

ALTER TABLE user_profiles ADD CONSTRAINT ck_profile_onboarding_status
    CHECK (onboarding_status IN ('PENDING', 'DISMISSED', 'COMPLETED'));
