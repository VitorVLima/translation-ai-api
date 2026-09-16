ALTER TABLE vocabulary_lessons
    ADD COLUMN quiz_completed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN quiz_score SMALLINT,
    ADD COLUMN writing_completed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN completed_at TIMESTAMPTZ;

ALTER TABLE vocabulary_lessons
    ADD CONSTRAINT ck_vocabulary_quiz_score
        CHECK (quiz_score IS NULL OR quiz_score BETWEEN 0 AND 5),
    ADD CONSTRAINT ck_vocabulary_quiz_completion
        CHECK ((quiz_completed AND quiz_score IS NOT NULL) OR (NOT quiz_completed AND quiz_score IS NULL)),
    ADD CONSTRAINT ck_vocabulary_lesson_completion
        CHECK (completed_at IS NULL OR (quiz_completed AND writing_completed));
