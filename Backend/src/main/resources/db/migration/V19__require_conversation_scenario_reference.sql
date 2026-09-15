-- Align with the existing 64-character API/catalog key contract.
ALTER TABLE conversations ALTER COLUMN scenario TYPE VARCHAR(64);

-- Preserve explicit scenario keys. Orphan rows must be repaired explicitly, never mapped to FREE_TALK.
ALTER TABLE conversations ADD CONSTRAINT fk_conversations_scenario
    FOREIGN KEY (scenario) REFERENCES conversation_scenario_definitions(scenario_key);
