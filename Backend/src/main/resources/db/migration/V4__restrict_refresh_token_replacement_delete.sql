DO $$
DECLARE
    existing_constraint text;
BEGIN
    SELECT constraint_info.conname
      INTO existing_constraint
      FROM pg_constraint constraint_info
      JOIN pg_attribute source_column
        ON source_column.attrelid = constraint_info.conrelid
       AND source_column.attnum = constraint_info.conkey[1]
     WHERE constraint_info.conrelid = 'refresh_tokens'::regclass
       AND constraint_info.confrelid = 'refresh_tokens'::regclass
       AND constraint_info.contype = 'f'
       AND source_column.attname = 'replaced_by_id';

    IF existing_constraint IS NULL THEN
        RAISE EXCEPTION 'Foreign key for refresh_tokens.replaced_by_id was not found';
    END IF;

    EXECUTE format(
        'ALTER TABLE refresh_tokens DROP CONSTRAINT %I',
        existing_constraint
    );
END
$$;

ALTER TABLE refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_replaced_by
    FOREIGN KEY (replaced_by_id)
    REFERENCES refresh_tokens(id)
    ON DELETE RESTRICT;
