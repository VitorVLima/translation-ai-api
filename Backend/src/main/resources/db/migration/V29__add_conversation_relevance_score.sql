ALTER TABLE conversation_evaluations ADD COLUMN relevance_score INTEGER;

ALTER TABLE conversation_evaluations
    ADD CONSTRAINT ck_conversation_evaluation_relevance_score
    CHECK (relevance_score IS NULL OR relevance_score BETWEEN 0 AND 100);

DO $$
DECLARE constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'conversation_evaluations'::regclass
      AND pg_get_constraintdef(oid) LIKE '%overall_score%communication_score%';
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE conversation_evaluations DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;
DO $$
DECLARE constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'conversation_evaluations'::regclass
      AND pg_get_constraintdef(oid) LIKE '%overall_score%result%';
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE conversation_evaluations DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

ALTER TABLE conversation_evaluations
    ADD CONSTRAINT conversation_evaluations_overall_score_check
    CHECK ((relevance_score IS NULL AND overall_score = (communication_score + grammar_score + vocabulary_score + fluency_score + 2) / 4)
        OR (relevance_score IS NOT NULL AND overall_score = (communication_score + grammar_score + vocabulary_score + fluency_score + relevance_score + 2) / 5));

ALTER TABLE conversation_evaluations
    ADD CONSTRAINT ck_conversation_evaluation_result
    CHECK ((relevance_score IS NULL AND ((overall_score >= 60 AND result='SUCCESS') OR (overall_score < 60 AND result='NEEDS_PRACTICE')))
        OR (relevance_score IS NOT NULL AND ((overall_score >= 60 AND relevance_score >= 50 AND communication_score >= 50 AND result='SUCCESS')
            OR ((overall_score < 60 OR relevance_score < 50 OR communication_score < 50) AND result='NEEDS_PRACTICE'))));
