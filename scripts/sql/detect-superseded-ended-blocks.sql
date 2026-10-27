-- Detect wrongly superseded blocks (superseded on or after their natural end date)
--
-- ROOT CAUSE (main branch, fixed in PR #168):
-- When rebuilding a plan from Settings after a block has ended (today > ends_on),
-- the code called rebuild_block without first running rollover. This marked the
-- ended block 'superseded' instead of 'completed', breaking Progress calculations.
--
-- CRITERION:
-- A block was wrongly superseded if:
--   1. status='superseded'
--   2. ended_on >= ends_on (superseded on or after natural end)
--   3. Optionally has a replacing block with carried-over week_offset
--
-- This matches the repair script's join logic.
--
-- READ-ONLY: This query only selects data, makes no changes.

SELECT
  old.user_id,
  old.id as superseded_block_id,
  old.block_number as superseded_block_number,
  old.started_on,
  old.ends_on,
  old.ended_on as superseded_on,
  old.week_offset as old_week_offset,
  new.id as replacing_block_id,
  new.block_number as replacing_block_number,
  new.started_on as replacing_started_on,
  new.week_offset as replacing_week_offset,
  (SELECT COUNT(*) FROM sessions s WHERE s.program_id = old.id) as session_count,
  (SELECT COUNT(*) FROM sessions s WHERE s.program_id = old.id AND s.status = 'completed') as completed_session_count
FROM programs old
LEFT JOIN programs new ON new.user_id = old.user_id
  AND new.started_on = old.ended_on + 1
  AND new.id <> old.id
  AND new.week_offset = old.week_offset + FLOOR((new.started_on - old.started_on) / 7)
WHERE old.status = 'superseded'
  AND old.ended_on IS NOT NULL
  AND old.ended_on >= old.ends_on
ORDER BY old.user_id, old.started_on;
