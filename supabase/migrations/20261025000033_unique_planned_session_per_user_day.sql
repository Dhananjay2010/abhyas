-- Unique index on planned sessions per user per local day
-- Ensures only one planned session exists per (user_id, local_date) combination
-- This prevents duplicate planned sessions from concurrent Keep operations

-- First, dedupe existing duplicate planned rows, keeping the LOWEST id
-- per (user_id, local_date). This is idempotent: re-running is safe.
DO $$
DECLARE
  deleted_count int;
BEGIN
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY user_id, local_date ORDER BY id) AS rn
    FROM sessions
    WHERE status = 'planned'
  ),
  to_delete AS (
    SELECT id
    FROM ranked
    WHERE rn > 1
  )
  DELETE FROM sessions
  WHERE id IN (SELECT id FROM to_delete);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  IF deleted_count > 0 THEN
    RAISE NOTICE 'Deleted % duplicate planned session(s)', deleted_count;
  END IF;
END $$;

-- Create the partial unique index (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS sessions_user_date_planned_unique
  ON sessions (user_id, local_date)
  WHERE status = 'planned';
