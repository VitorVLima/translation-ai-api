ALTER TABLE conversations
    ADD COLUMN difficulty VARCHAR(16) NOT NULL DEFAULT 'INTERMEDIATE',
    ADD CONSTRAINT ck_conversation_difficulty
        CHECK (difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED'));
