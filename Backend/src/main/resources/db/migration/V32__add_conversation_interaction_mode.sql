ALTER TABLE conversations
    ADD COLUMN interaction_mode VARCHAR(8) NOT NULL DEFAULT 'TEXT',
    ADD CONSTRAINT ck_conversation_interaction_mode CHECK (interaction_mode IN ('TEXT', 'VOICE'));
