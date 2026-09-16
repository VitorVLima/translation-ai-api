CREATE TABLE user_vocabulary_words (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word VARCHAR(120) NOT NULL,
    normalized_word VARCHAR(120) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'NEW',
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    last_reviewed_at TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uk_user_vocabulary_word UNIQUE (user_id, normalized_word),
    CONSTRAINT ck_user_vocabulary_status CHECK (status IN ('NEW','LEARNING','REVIEWING','MASTERED'))
);

CREATE INDEX idx_user_vocabulary_status ON user_vocabulary_words (user_id, status);
CREATE INDEX idx_user_vocabulary_next_review ON user_vocabulary_words (user_id, next_review_at);

WITH normalized AS (
    SELECT l.user_id,
           i.word,
           lower(regexp_replace(btrim(i.word), '\\s+', ' ', 'g')) AS normalized_word,
           i.status,
           i.correct_count,
           i.incorrect_count,
           l.created_at,
           row_number() OVER (
               PARTITION BY l.user_id, lower(regexp_replace(btrim(i.word), '\\s+', ' ', 'g'))
               ORDER BY l.created_at ASC, i.position ASC, i.id ASC
           ) AS first_row,
           row_number() OVER (
               PARTITION BY l.user_id, lower(regexp_replace(btrim(i.word), '\\s+', ' ', 'g'))
               ORDER BY l.created_at DESC, i.position DESC, i.id DESC
           ) AS last_row
    FROM vocabulary_items i
    JOIN vocabulary_lessons l ON l.id = i.lesson_id
), aggregated AS (
    SELECT user_id, normalized_word, sum(correct_count) AS correct_count,
           sum(incorrect_count) AS incorrect_count, min(created_at) AS first_seen_at,
           max(created_at) AS last_seen_at,
           max(CASE status WHEN 'NEW' THEN 0 WHEN 'LEARNING' THEN 1 WHEN 'REVIEWING' THEN 2 WHEN 'MASTERED' THEN 3 END) AS status_rank
    FROM normalized
    GROUP BY user_id, normalized_word
), representative AS (
    SELECT DISTINCT ON (user_id, normalized_word) user_id, normalized_word, word
    FROM normalized
    ORDER BY user_id, normalized_word, last_row
)
INSERT INTO user_vocabulary_words
    (id, user_id, word, normalized_word, status, correct_count, incorrect_count,
     first_seen_at, last_seen_at, created_at, updated_at)
SELECT md5(a.user_id::text || ':' || a.normalized_word)::uuid,
       a.user_id, r.word, a.normalized_word,
       CASE a.status_rank WHEN 0 THEN 'NEW' WHEN 1 THEN 'LEARNING'
            WHEN 2 THEN 'REVIEWING' ELSE 'MASTERED' END,
       a.correct_count, a.incorrect_count, a.first_seen_at, a.last_seen_at,
       a.first_seen_at, a.last_seen_at
FROM aggregated a
JOIN representative r USING (user_id, normalized_word);

ALTER TABLE vocabulary_items ADD COLUMN vocabulary_word_id UUID;

UPDATE vocabulary_items i
SET vocabulary_word_id = w.id
FROM vocabulary_lessons l, user_vocabulary_words w
WHERE i.lesson_id = l.id
  AND w.user_id = l.user_id
  AND w.normalized_word = lower(regexp_replace(btrim(i.word), '\\s+', ' ', 'g'));

ALTER TABLE vocabulary_items
    ALTER COLUMN vocabulary_word_id SET NOT NULL,
    ADD CONSTRAINT fk_vocabulary_item_word FOREIGN KEY (vocabulary_word_id)
        REFERENCES user_vocabulary_words(id);

ALTER TABLE vocabulary_items
    DROP CONSTRAINT ck_vocabulary_status,
    DROP COLUMN status,
    DROP COLUMN correct_count,
    DROP COLUMN incorrect_count;
