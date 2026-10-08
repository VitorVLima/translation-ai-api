-- Normalize only rows without a case-insensitive collision. Existing collisions
-- remain untouched for manual, reference-aware remediation.
UPDATE users AS user_to_normalize
SET email = lower(btrim(user_to_normalize.email))
WHERE user_to_normalize.email IS DISTINCT FROM lower(btrim(user_to_normalize.email))
  AND NOT EXISTS (
      SELECT 1
      FROM users AS other_user
      WHERE other_user.id <> user_to_normalize.id
        AND lower(btrim(other_user.email)) = lower(btrim(user_to_normalize.email))
  );

-- A unique expression index cannot be created while legacy collisions exist.
-- This trigger normalizes every new/changed email and rejects any normalized
-- duplicate, while leaving legacy rows unchanged until they are remediated.
CREATE OR REPLACE FUNCTION normalize_and_guard_user_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    normalized_email text;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.email IS NOT DISTINCT FROM OLD.email THEN
        RETURN NEW;
    END IF;

    normalized_email := lower(btrim(NEW.email));
    NEW.email := normalized_email;

    IF EXISTS (
        SELECT 1
        FROM users AS existing_user
        WHERE existing_user.id <> NEW.id
          AND lower(btrim(existing_user.email)) = normalized_email
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23505',
            CONSTRAINT = 'uk_users_normalized_email',
            MESSAGE = 'A user with this normalized email already exists';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_normalize_and_guard_email
BEFORE INSERT OR UPDATE OF email ON users
FOR EACH ROW
EXECUTE FUNCTION normalize_and_guard_user_email();

CREATE INDEX IF NOT EXISTS idx_users_normalized_email
    ON users ((lower(btrim(email))));
