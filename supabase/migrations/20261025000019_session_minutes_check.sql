-- Migration: Add constraint to session minutes
-- Date: 2026-10-25
-- 
-- This migration enforces that preferred_session_minutes must be one of 30, 45, 60, or 75.
-- It first maps any existing non-conforming values to the nearest allowed value.

-- Step 1: Map existing non-conforming values to nearest allowed value
--   <=37  → 30
--   38-52 → 45
--   53-67 → 60
--   >=68  → 75
--   ties go to the larger value (e.g., 37.5 → 45)
UPDATE profiles
SET preferred_session_minutes = CASE
  WHEN preferred_session_minutes <= 37 THEN 30
  WHEN preferred_session_minutes >= 38 AND preferred_session_minutes <= 52 THEN 45
  WHEN preferred_session_minutes >= 53 AND preferred_session_minutes <= 67 THEN 60
  WHEN preferred_session_minutes >= 68 THEN 75
  ELSE preferred_session_minutes  -- Should never happen, but include for completeness
END
WHERE preferred_session_minutes IS NOT NULL
  AND preferred_session_minutes NOT IN (30, 45, 60, 75);

-- Step 2: Drop the constraint if it exists (for idempotency)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_preferred_session_minutes_check;

-- Step 3: Add the constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_preferred_session_minutes_check 
  CHECK (preferred_session_minutes IS NULL OR preferred_session_minutes IN (30, 45, 60, 75));
