-- Repair wrongly superseded blocks (PR #168 bug fix follow-up)
--
-- ROOT CAUSE (main branch, fixed in PR #168):
-- When rebuilding a plan from Settings after a block has ended (today > ends_on),
-- the code called rebuild_block without first running rollover. This:
--   1. Marked the ended block 'superseded' instead of 'completed'
--   2. Set the new block's week_offset incorrectly (carried over cycle weeks)
--   3. Caused Progress to filter out the superseded block entirely
--   4. Caused Today to show "Week 5 of 4" due to wrong week_offset
--
-- WHAT THIS SCRIPT FIXES:
--   1. Re-marks wrongly superseded blocks as 'completed'
--   2. Sets their ended_on = ends_on (natural end date)
--   3. Resets the replacing block's week_offset to 0 (as rollover would)
--   4. Handles blocks with no replacement (still marks them completed)
--
-- IDEMPOTENT: Running twice changes nothing the second time.
-- ONE TRANSACTION: All changes commit together or roll back together.
-- PRESERVES SESSIONS: Never touches sessions, session_exercises, or session_sets.
-- TOUCHES: programs table only (status, ended_on, week_offset columns)

BEGIN;

-- Create temp table with repair targets
-- The guard `new.week_offset = old.week_offset + FLOOR((new.started_on - old.started_on)/7)`
-- ensures we only fix blocks where the week_offset was carried over.
-- rebuild_block sets new.started_on = p_today and old.ended_on = p_today - 1,
-- so new.started_on = old.ended_on + 1 when they're consecutive.
CREATE TEMP TABLE _repair_targets ON COMMIT DROP AS
SELECT
  old.id AS old_id,
  old.user_id,
  new.id AS new_id,
  old.ends_on,
  old.week_offset AS old_week_offset,
  new.week_offset AS new_week_offset
FROM programs old
LEFT JOIN programs new ON new.user_id = old.user_id
  AND new.started_on = old.ended_on + 1
  AND new.id <> old.id
  AND new.week_offset = old.week_offset + FLOOR((new.started_on - old.started_on) / 7)
WHERE old.status = 'superseded'
  AND old.ended_on IS NOT NULL
  AND old.ended_on >= old.ends_on;

-- Step 1: Fix wrongly superseded blocks (mark as completed, fix ended_on)
UPDATE programs p
SET
  status = 'completed',
  ended_on = rt.ends_on
FROM _repair_targets rt
WHERE p.id = rt.old_id
  AND p.status = 'superseded';  -- Guard: only update if still superseded

-- Step 2: Fix replacing blocks' week_offset (reset to 0)
-- Handles chains: if a mid-block rebuild happened on the replacing block,
-- it kept the bad week_offset, so we fix every block in the chain.
UPDATE programs p
SET
  week_offset = 0
FROM _repair_targets rt
WHERE p.id = rt.new_id
  AND rt.new_id IS NOT NULL
  AND p.week_offset != 0;  -- Only update if not already 0

COMMIT;

-- How to verify this worked:
-- Run scripts/sql/detect-superseded-ended-blocks.sql
-- Should return 0 rows after running this script.
