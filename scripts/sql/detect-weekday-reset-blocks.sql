-- Detect accounts hit by QA2 M-1: block 2+ silently reset to the default weekdays
-- (fixed in PR "block 2+ keeps the previous block's training weekdays").
--
-- READ-ONLY: the statement below is a SELECT. Safe to run on production at any time:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/detect-weekday-reset-blocks.sql
--
-- One result set, ONE ROW PER USER, tagged with its check name in the first column.
--
-- weekday_reset: the user's ACTIVE block (block 2+) trains on a different set of
-- weekdays from the block before it. "The block before it" is the user's latest
-- NON-superseded block that has ended (status completed or abandoned) and started
-- before the active one. "Training weekdays" are the active program_days rows whose
-- day_type is a scheduled session, i.e. not rest, active_recovery or meditation
-- (yoga days count, the same rule as src/lib/program/weekday-layout.ts).
--
-- Not listed (legitimate or unaffected):
--   - a changed day count: the two blocks' days_per_week differ, or their numbers of
--     training weekdays differ (an explicit Settings change; the new count wins);
--   - yoga- or breathing-led active blocks (primary_track yoga / meditation): their
--     5-day week is always the default and is left unchanged;
--   - blocks whose weekdays carried over, and pre-#165 users whose blocks are all on
--     the default Mon/Wed/Fri-style week (same set both sides);
--   - a previous block with no training-day rows (nothing to compare).
-- Only the weekday SET is compared, not which session lands on which day.

WITH training_days AS (
  SELECT
    d.program_id,
    array_agg(DISTINCT d.day_index ORDER BY d.day_index) AS weekdays,
    COUNT(DISTINCT d.day_index) AS weekday_count
  FROM program_days d
  WHERE d.status = 'active'
    AND d.day_type::text NOT IN ('rest', 'active_recovery', 'meditation')
  GROUP BY d.program_id
), pairs AS (
  SELECT
    cur.user_id,
    prev.id AS previous_block_id,
    prev.block_number AS previous_block_number,
    prev.status::text AS previous_status,
    prev.started_on AS previous_started_on,
    prev.days_per_week AS previous_days_per_week,
    cur.id AS current_block_id,
    cur.block_number AS current_block_number,
    cur.started_on AS current_started_on,
    cur.days_per_week AS current_days_per_week,
    cur.primary_track::text AS current_primary_track,
    pt.weekdays AS previous_weekdays,
    pt.weekday_count AS previous_weekday_count,
    ct.weekdays AS current_weekdays,
    ct.weekday_count AS current_weekday_count
  FROM programs cur
  JOIN LATERAL (
    SELECT p.*
    FROM programs p
    WHERE p.user_id = cur.user_id
      AND p.id <> cur.id
      AND p.status::text IN ('completed', 'abandoned')
      AND p.started_on < cur.started_on
    ORDER BY p.started_on DESC, p.block_number DESC, p.created_at DESC
    LIMIT 1
  ) prev ON true
  JOIN training_days pt ON pt.program_id = prev.id
  LEFT JOIN training_days ct ON ct.program_id = cur.id
  WHERE cur.status::text = 'active'
    AND cur.block_number >= 2
)
SELECT
  'weekday_reset' AS check_name,
  x.user_id,
  x.previous_block_number,
  x.current_block_number,
  array_to_string(x.previous_weekdays, ',') AS previous_weekdays,
  array_to_string(x.current_weekdays, ',') AS current_weekdays,
  x.previous_days_per_week,
  x.current_days_per_week,
  x.previous_block_id,
  x.current_block_id,
  x.previous_status,
  x.current_started_on,
  (SELECT COUNT(*) FROM sessions s WHERE s.program_id = x.current_block_id) AS current_block_sessions
FROM pairs x
WHERE x.current_primary_track NOT IN ('yoga', 'meditation')
  AND x.previous_days_per_week IS NOT DISTINCT FROM x.current_days_per_week
  AND x.previous_weekday_count = COALESCE(x.current_weekday_count, 0)
  AND x.previous_weekdays IS DISTINCT FROM x.current_weekdays
ORDER BY x.user_id;
