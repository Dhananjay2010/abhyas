-- Add column to track weight when failure streak started
-- Required for M1: two-miss back-off must use pre-miss weight, not first-miss-dropped weight

ALTER TABLE exercise_progress
ADD COLUMN IF NOT EXISTS weight_at_failure_start_kg numeric(6,2);

COMMENT ON COLUMN exercise_progress.weight_at_failure_start_kg IS
  'Weight when consecutive_failures went from 0 to 1. Used to compute two-miss back-off from the original weight rather than compounding drops. Cleared when failures reset to 0.';
