ALTER TABLE user_vocabulary_words
    ADD COLUMN review_stage SMALLINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_user_vocabulary_review_stage CHECK (review_stage BETWEEN 0 AND 5);

-- Existing records have no proven review cadence. Preserve their status but do not schedule them.
UPDATE user_vocabulary_words
SET review_stage = CASE status
    WHEN 'LEARNING' THEN 1
    WHEN 'REVIEWING' THEN 2
    WHEN 'MASTERED' THEN 4
    ELSE 0
END;

CREATE INDEX idx_user_vocabulary_due_review
    ON user_vocabulary_words (user_id, next_review_at);

ALTER TABLE vocabulary_items
    ADD COLUMN review_item BOOLEAN NOT NULL DEFAULT FALSE;
