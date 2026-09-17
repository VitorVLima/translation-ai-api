ALTER TABLE conversations ADD COLUMN ended_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN response_in_progress BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE conversation_evaluations (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    difficulty VARCHAR(16) NOT NULL CHECK (difficulty IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
    scenario VARCHAR(64) NOT NULL,
    communication_score INTEGER NOT NULL CHECK (communication_score BETWEEN 0 AND 100),
    grammar_score INTEGER NOT NULL CHECK (grammar_score BETWEEN 0 AND 100),
    vocabulary_score INTEGER NOT NULL CHECK (vocabulary_score BETWEEN 0 AND 100),
    fluency_score INTEGER NOT NULL CHECK (fluency_score BETWEEN 0 AND 100),
    overall_score INTEGER NOT NULL CHECK (overall_score = (communication_score + grammar_score + vocabulary_score + fluency_score + 2) / 4),
    result VARCHAR(16) NOT NULL CHECK (result IN ('SUCCESS','NEEDS_PRACTICE')),
    strengths TEXT NOT NULL,
    improvements TEXT NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uk_conversation_evaluation UNIQUE (conversation_id),
    CONSTRAINT ck_conversation_evaluation_result CHECK ((overall_score >= 60 AND result='SUCCESS') OR (overall_score < 60 AND result='NEEDS_PRACTICE'))
);
-- Ownership uses the existing conversations(user_id, updated_at) index and unique conversation FK.
CREATE INDEX idx_conversation_evaluation_difficulty_time ON conversation_evaluations(difficulty, evaluated_at);
