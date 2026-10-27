-- Unique index on planned sessions per user per local day
-- Ensures only one planned session exists per (user_id, local_date) combination
-- This prevents duplicate planned sessions from concurrent Keep operations

-- First, dedupe existing duplicate planned rows.
-- Ranking: prefer rows with logged data (sets, exercises, breathing), then oldest, then lowest id.
-- Childless duplicates: DELETE.
-- Data-bearing duplicates: UPDATE to status='skipped' (preserves data; skipped sessions are not startable).
-- This is idempotent: re-running is safe.
DO $$
DECLARE
  deleted_count int;
  skipped_count int;
BEGIN
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, local_date
        ORDER BY
          EXISTS(
            SELECT 1 FROM public.session_exercises se
            WHERE se.session_id = sessions.id
              AND EXISTS(SELECT 1 FROM public.session_sets ss WHERE ss.session_exercise_id = se.id)
          ) DESC,
          EXISTS(SELECT 1 FROM public.session_exercises se WHERE se.session_id = sessions.id) DESC,
          EXISTS(SELECT 1 FROM public.breathing_logs bl WHERE bl.session_id = sessions.id) DESC,
          created_at ASC,
          id ASC
      ) AS rn
    FROM public.sessions
    WHERE status = 'planned'
  ),
  to_skip AS (
    SELECT s.id
    FROM ranked r
    JOIN public.sessions s ON s.id = r.id
    WHERE r.rn > 1
      AND (
        EXISTS(SELECT 1 FROM public.session_exercises se WHERE se.session_id = s.id)
        OR EXISTS(SELECT 1 FROM public.breathing_logs bl WHERE bl.session_id = s.id)
      )
  ),
  skipped AS (
    UPDATE public.sessions
    SET status = 'skipped'
    WHERE id IN (SELECT id FROM to_skip)
    RETURNING id
  ),
  to_delete AS (
    SELECT r.id
    FROM ranked r
    WHERE r.rn > 1
      AND r.id NOT IN (SELECT id FROM to_skip)
  ),
  deleted AS (
    DELETE FROM public.sessions
    WHERE id IN (SELECT id FROM to_delete)
    RETURNING id
  )
  SELECT 
    (SELECT COUNT(*) FROM deleted) AS del_count,
    (SELECT COUNT(*) FROM skipped) AS skip_count
  INTO deleted_count, skipped_count;
  
  IF deleted_count > 0 OR skipped_count > 0 THEN
    RAISE NOTICE 'Dedupe: deleted % childless duplicate(s), skipped % data-bearing duplicate(s)', deleted_count, skipped_count;
  END IF;
END $$;

-- Create the partial unique index (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS sessions_user_date_planned_unique
  ON public.sessions (user_id, local_date)
  WHERE status = 'planned';
