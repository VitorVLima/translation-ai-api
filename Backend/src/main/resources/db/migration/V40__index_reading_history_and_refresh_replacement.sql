-- Supports ordered, bounded Reading history for one user.
CREATE INDEX idx_reading_activity_user_created_id
    ON reading_activities(user_id, created_at DESC, id DESC);

-- Supports leaf-first bounded cleanup of expired refresh-token families.
CREATE INDEX idx_refresh_tokens_replaced_by_id
    ON refresh_tokens(replaced_by_id) WHERE replaced_by_id IS NOT NULL;
