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
--
-- IDEMPOTENT: Running twice changes nothing the second time.
-- ONE TRANSACTION: All changes commit together or roll back together.
-- PRESERVES SESSIONS: Never touches sessions, session_exercises, or session_sets.
-- TOUCHES: programs table only (status, ended_on, week_offset columns)

BEGIN;

-- Step 1: Identify and fix wrongly superseded blocks
-- These are blocks with status='superseded' AND ended_on >= ends_on
-- (superseded on or after their natural end, not mid-block rebuilds)
WITH wrongly_superseded AS (
  SELECT
    p.id,
    p.user_id,
    p.ends_on as natural_end,
    p.ended_on as superseded_on
  FROM programs p
  WHERE p.status = 'superseded'
    AND p.ended_on IS NOT NULL
    AND p.ended_on >= p.ends_on
),

-- Step 2: Find the replacing blocks for each wrongly superseded block
-- The replacing block is the next active or completed block after ended_on
replacing_blocks AS (
  SELECT DISTINCT ON (ws.id)
    ws.id as old_block_id,
    ws.user_id,
    ws.natural_end,
    p2.id as replacing_block_id,
    p2.started_on as replacing_started_on,
    p2.week_offset as replacing_week_offset
  FROM wrongly_superseded ws
  JOIN programs p2 ON p2.user_id = ws.user_id
  WHERE p2.status IN ('active', 'completed')
    AND (
      p2.started_on > ws.superseded_on
      OR (p2.started_on = ws.superseded_on + 1 AND p2.id != ws.id)
    )
  ORDER BY ws.id, p2.started_on, p2.created_at
)

-- Step 3: Update wrongly superseded blocks to 'completed' with ended_on = ends_on
UPDATE programs p
SET
  status = 'completed',
  ended_on = p.ends_on
FROM wrongly_superseded ws
WHERE p.id = ws.id
  AND p.status = 'superseded';  -- Guard: only update if still superseded

-- Step 4: Fix the replacing blocks' week_offset to 0 (as rollover_block would)
-- This fixes the "Week 5 of 4" issue on Today page
UPDATE programs p
SET
  week_offset = 0
FROM replacing_blocks rb
WHERE p.id = rb.replacing_block_id
  AND p.week_offset != 0;  -- Only update if not already 0

COMMIT;

-- How to verify this worked:
-- SELECT COUNT(*) FROM programs WHERE status = 'superseded' AND ended_on >= ends_on;
-- Should return 0 after running this script.
