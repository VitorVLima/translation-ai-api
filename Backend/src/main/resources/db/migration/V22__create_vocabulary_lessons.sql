CREATE TABLE vocabulary_lessons (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    lesson_date DATE NOT NULL,
    english_level VARCHAR(2) NOT NULL,
    category VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uk_vocabulary_user_day UNIQUE (user_id, lesson_date),
    CONSTRAINT ck_vocabulary_level CHECK (english_level IN ('A1','A2','B1','B2','C1','C2'))
);
CREATE TABLE vocabulary_items (
    id UUID PRIMARY KEY,
    lesson_id UUID NOT NULL REFERENCES vocabulary_lessons(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    word VARCHAR(120) NOT NULL,
    translation VARCHAR(200) NOT NULL,
    example VARCHAR(500) NOT NULL,
    example_translation VARCHAR(600) NOT NULL,
    category VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'NEW',
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uk_vocabulary_lesson_position UNIQUE (lesson_id, position),
    CONSTRAINT ck_vocabulary_status CHECK (status IN ('NEW','LEARNING','REVIEWING','MASTERED'))
);
