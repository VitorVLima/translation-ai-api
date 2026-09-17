-- V24 already provides the (user_id, next_review_at) access path used by
-- due-review queries. Keep a single index for that lookup.
DROP INDEX IF EXISTS idx_user_vocabulary_due_review;
