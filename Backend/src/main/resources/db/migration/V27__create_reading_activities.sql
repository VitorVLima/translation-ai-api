CREATE TABLE reading_activities (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    difficulty VARCHAR(16) NOT NULL,
    topic VARCHAR(32) NOT NULL,
    text VARCHAR(5000) NOT NULL,
    question_count SMALLINT NOT NULL CHECK (question_count = 3),
    correct_answers SMALLINT,
    comprehension_percentage SMALLINT,
    status VARCHAR(24) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    CONSTRAINT ck_reading_activity_score CHECK (correct_answers IS NULL OR correct_answers BETWEEN 0 AND 3),
    CONSTRAINT ck_reading_activity_percentage CHECK (comprehension_percentage IS NULL OR comprehension_percentage BETWEEN 0 AND 100)
);
CREATE INDEX idx_reading_activity_user_completed ON reading_activities(user_id, completed_at);
CREATE INDEX idx_reading_activity_user_difficulty ON reading_activities(user_id, difficulty);
CREATE TABLE reading_questions (
    id UUID PRIMARY KEY,
    activity_id UUID NOT NULL REFERENCES reading_activities(id) ON DELETE CASCADE,
    question_number SMALLINT NOT NULL,
    type VARCHAR(16) NOT NULL,
    question VARCHAR(500) NOT NULL,
    option_a VARCHAR(300) NOT NULL,
    option_b VARCHAR(300) NOT NULL,
    option_c VARCHAR(300) NOT NULL,
    option_d VARCHAR(300) NOT NULL,
    correct_option SMALLINT NOT NULL CHECK (correct_option BETWEEN 0 AND 3),
    explanation VARCHAR(800) NOT NULL,
    CONSTRAINT uk_reading_question_number UNIQUE(activity_id, question_number)
);
