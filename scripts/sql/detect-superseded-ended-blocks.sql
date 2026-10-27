-- Detect wrongly superseded blocks (superseded on or after their natural end date)
--
-- ROOT CAUSE (main branch, fixed in PR #168):
-- When rebuilding a plan from Settings after a block has ended (today > ends_on),
-- the code called rebuild_block without first running rollover. This marked the
-- ended block 'superseded' instead of 'completed', breaking Progress calculations.
--
-- CRITERION:
-- A block was wrongly superseded if status='superseded' AND ended_on >= ends_on.
-- This distinguishes them from legitimate mid-block rebuilds where ended_on < ends_on.
--
-- The ended_on column (set by rebuild_block) tells us when the block was superseded.
-- If ended_on >= ends_on, the block had already ended naturally when rebuild ran.
--
-- READ-ONLY: This query only selects data, makes no changes.

SELECT
  p.user_id,
  p.id as superseded_block_id,
  p.block_number as superseded_block_number,
  p.started_on,
  p.ends_on,
  p.ended_on as superseded_on,
  -- Find the replacing block: the next active or completed block after this one
  (
    SELECT p2.id
    FROM programs p2
    WHERE p2.user_id = p.user_id
      AND p2.status IN ('active', 'completed')
      AND (
        p2.started_on > p.ended_on
        OR (p2.started_on = p.ended_on + 1 AND p2.created_at > p.created_at)
      )
    ORDER BY p2.started_on, p2.created_at
    LIMIT 1
  ) as replacing_block_id,
  -- Count sessions inside the superseded block's original range
  (
    SELECT COUNT(*)
    FROM sessions s
    WHERE s.program_id = p.id
  ) as session_count,
  -- Count completed sessions
  (
    SELECT COUNT(*)
    FROM sessions s
    WHERE s.program_id = p.id
      AND s.status = 'completed'
  ) as completed_session_count
FROM programs p
WHERE p.status = 'superseded'
  AND p.ended_on IS NOT NULL
  AND p.ended_on >= p.ends_on  -- Superseded on or after natural end
ORDER BY p.user_id, p.started_on;
