ALTER TABLE reading_activities ADD COLUMN title VARCHAR(120);

-- Older passages have no generated title. Use their opening sentence so the
-- history remains readable and tied to the actual persisted content.
UPDATE reading_activities
SET title = COALESCE(
    NULLIF(left(btrim(split_part(translate(text, E'\n\r', '  '), '.', 1)), 120), ''),
    NULLIF(left(btrim(text), 120), ''),
    'Reading'
);

ALTER TABLE reading_activities ALTER COLUMN title SET NOT NULL;
ALTER TABLE reading_activities ADD CONSTRAINT ck_reading_activity_title_not_blank CHECK (length(btrim(title)) > 0);
