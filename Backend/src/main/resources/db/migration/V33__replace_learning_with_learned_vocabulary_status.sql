-- Preserve the existing progress rows while aligning the public vocabulary
-- state vocabulary with the four-state model.
ALTER TABLE user_vocabulary_words
    DROP CONSTRAINT ck_user_vocabulary_status;

UPDATE user_vocabulary_words
SET status = 'LEARNED'
WHERE status = 'LEARNING';

ALTER TABLE user_vocabulary_words
    ADD CONSTRAINT ck_user_vocabulary_status
        CHECK (status IN ('NEW', 'REVIEWING', 'LEARNED', 'MASTERED'));
