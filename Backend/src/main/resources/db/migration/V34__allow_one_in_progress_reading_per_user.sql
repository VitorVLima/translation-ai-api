-- Keep the newest open activity for each user. Older duplicate rows remain
-- available in history, but are closed so the invariant can be enforced
-- without deleting persisted reading content.
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS position
    FROM reading_activities
    WHERE status = 'IN_PROGRESS'
)
UPDATE reading_activities AS activity
SET status = 'NEEDS_PRACTICE',
    completed_at = COALESCE(activity.completed_at, activity.created_at)
FROM ranked
WHERE activity.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX uk_reading_activity_one_in_progress_per_user
    ON reading_activities(user_id)
    WHERE status = 'IN_PROGRESS';
