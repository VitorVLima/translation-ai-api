-- NULL voice preserves the provider's configured default for each conversation language.
ALTER TABLE conversation_scenario_definitions
    ADD COLUMN tts_voice VARCHAR(128),
    ADD COLUMN speech_rate DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    ADD CONSTRAINT ck_scenario_tts_voice CHECK (tts_voice IS NULL OR tts_voice ~ '^[A-Za-z0-9_-]{1,128}$'),
    ADD CONSTRAINT ck_scenario_speech_rate CHECK (speech_rate >= 0.75 AND speech_rate <= 1.25);
