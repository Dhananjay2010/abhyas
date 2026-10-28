-- Detect accounts hit by main's rebuild-after-block-end bug (fixed in PR #168).
--
-- READ-ONLY: every statement below is a SELECT. Safe to run on production at any time:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/detect-superseded-ended-blocks.sql
--
-- Three result sets, ONE ROW PER USER, each tagged with its check name in the first column.
-- Column 3 is that user's block ids (comma-separated, by started_on); the rest is
-- aggregated detail.
--
-- 1. superseded_ended: blocks wrongly superseded on or after their natural end
--    (status = 'superseded' AND ended_on >= ends_on). A legitimate mid-block rebuild always
--    has ended_on = p_today - 1 < ends_on, so it never matches. The repair script fixes these.
--    Must be 0 rows after the repair.
--
-- 2. past_week_4: active or completed blocks that show, or will show, a week past 4:
--    week_offset >= 4, or the cycle week on the block's last covered day
--    (least(coalesce(ended_on, ends_on), ends_on)) is above 4. A block's current week is
--    never above its last-day week, so this covers every block whose current week is > 4.
--    Before the repair it includes each replacing block of check 1 (week_offset 4+).
--    After the repair, any row left here is NOT auto-repaired: it is a chain the repair
--    cannot safely reason about (e.g. a replacing block later rebuilt while migration
--    20261025000023's rebuild_block was live, which restarted the row with the inflated
--    offset carried). List those users for manual handling.
--
-- 3. block_number_sequence: users whose NON-superseded blocks (active, completed, abandoned)
--    are not numbered 1..N by started_on, or who have a superseded row numbered above N
--    (which would make the next rollover skip numbers). Superseded rows are rebuild
--    leftovers that are never shown. Example: 17 rows numbered 1-13 where the real blocks
--    show as "Block 12" and "Block 13". It also includes check-1 users once step 1 has
--    completed their old block (their replacing block is block 1 again). The repair
--    renumbers these users, so check 3 must return 0 rows after the repair.

-- 1. superseded_ended
SELECT
  'superseded_ended' AS check_name,
  t.user_id,
  string_agg(DISTINCT t.superseded_block_id::text, ',') AS superseded_block_ids,
  string_agg(DISTINCT t.replacing_block_id::text, ',') AS replacing_block_ids,
  COUNT(DISTINCT t.superseded_block_id) AS superseded_blocks,
  COUNT(DISTINCT t.replacing_block_id) AS replacing_blocks,
  MIN(t.started_on) AS first_started_on,
  MAX(t.superseded_on) AS last_superseded_on,
  string_agg(DISTINCT t.superseded_block_number::text || '->' || COALESCE(t.replacing_block_number::text, '-'), ',') AS block_numbers,
  MAX(t.replacing_week_offset) AS max_replacing_week_offset,
  (SELECT COUNT(*) FROM sessions s JOIN programs o ON o.id = s.program_id
    WHERE o.user_id = t.user_id AND o.status = 'superseded' AND o.ended_on >= o.ends_on) AS session_count,
  (SELECT COUNT(*) FROM sessions s JOIN programs o ON o.id = s.program_id
    WHERE o.user_id = t.user_id AND o.status = 'superseded' AND o.ended_on >= o.ends_on
      AND s.status = 'completed') AS completed_session_count
FROM (
  SELECT
    old.user_id,
    old.id AS superseded_block_id,
    old.block_number AS superseded_block_number,
    old.started_on,
    old.ended_on AS superseded_on,
    new.id AS replacing_block_id,
    new.block_number AS replacing_block_number,
    new.week_offset AS replacing_week_offset
  FROM programs old
  LEFT JOIN programs new ON new.user_id = old.user_id
    AND new.started_on = old.ended_on + 1
    AND new.id <> old.id
    AND new.week_offset = old.week_offset + FLOOR((new.started_on - old.started_on) / 7)
  WHERE old.status = 'superseded'
    AND old.ended_on IS NOT NULL
    AND old.ended_on >= old.ends_on
) t
GROUP BY t.user_id
ORDER BY t.user_id;

-- 2. past_week_4
SELECT
  'past_week_4' AS check_name,
  w.user_id,
  string_agg(w.id::text, ',' ORDER BY w.started_on, w.id) AS block_ids,
  string_agg(w.status::text || ' #' || w.block_number || ' ' || w.started_on || '..' || w.ends_on
    || ' offset ' || w.week_offset || ' weeks ' || w.first_day_week || '-' || w.last_day_week, '; ' ORDER BY w.started_on, w.id) AS blocks,
  MAX(w.last_day_week) AS max_week,
  SUM(w.session_count) AS session_count
FROM (
  SELECT
    p.user_id, p.id, p.status, p.block_number, p.started_on, p.ends_on, p.week_offset,
    public.cycle_week_for(p.week_offset, p.started_on, p.started_on) AS first_day_week,
    public.cycle_week_for(p.week_offset, p.started_on, LEAST(COALESCE(p.ended_on, p.ends_on), p.ends_on)) AS last_day_week,
    (SELECT COUNT(*) FROM sessions s WHERE s.program_id = p.id) AS session_count
  FROM programs p
  WHERE p.status IN ('active', 'completed')
) w
WHERE w.week_offset >= 4 OR w.last_day_week > 4
GROUP BY w.user_id
ORDER BY w.user_id;

-- 3. block_number_sequence
WITH ordered AS (
  SELECT
    p.id, p.user_id, p.status, p.started_on, p.block_number,
    COALESCE(SUM(CASE WHEN p.status <> 'superseded' THEN 1 ELSE 0 END) OVER (
      PARTITION BY p.user_id
      ORDER BY p.started_on, p.created_at, (p.status = 'superseded') DESC, p.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0) AS prior_blocks,
    SUM(CASE WHEN p.status <> 'superseded' THEN 1 ELSE 0 END) OVER (PARTITION BY p.user_id) AS real_blocks
  FROM programs p
), expected AS (
  SELECT
    o.*,
    CASE
      WHEN o.status <> 'superseded' THEN o.prior_blocks + 1
      ELSE LEAST(o.prior_blocks + 1, GREATEST(o.real_blocks, 1))
    END AS expected_block_number
  FROM ordered o
)
SELECT
  'block_number_sequence' AS check_name,
  e.user_id,
  string_agg(e.id::text, ',' ORDER BY e.started_on, e.id) FILTER (WHERE e.status <> 'superseded') AS block_ids,
  string_agg(e.block_number::text, ',' ORDER BY e.started_on, e.id) FILTER (WHERE e.status <> 'superseded') AS block_numbers,
  string_agg(e.expected_block_number::text, ',' ORDER BY e.started_on, e.id) FILTER (WHERE e.status <> 'superseded') AS expected_block_numbers,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE e.status = 'superseded') AS superseded_rows,
  MAX(e.block_number) + 1 AS next_rollover_now,
  MAX(e.real_blocks) + 1 AS next_rollover_after_repair
FROM expected e
GROUP BY e.user_id
HAVING bool_or(e.status <> 'superseded' AND e.block_number <> e.expected_block_number)
    OR bool_or(e.status = 'superseded' AND e.block_number > GREATEST(e.real_blocks, 1))
ORDER BY e.user_id;
