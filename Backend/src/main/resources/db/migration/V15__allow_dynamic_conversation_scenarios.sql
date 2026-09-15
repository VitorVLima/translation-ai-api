ALTER TABLE conversations DROP CONSTRAINT ck_conversation_scenario;
ALTER TABLE conversations ADD CONSTRAINT ck_conversation_scenario_key CHECK (scenario ~ '^[A-Z][A-Z0-9_]{2,63}$');
