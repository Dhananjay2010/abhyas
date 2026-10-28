-- Repair accounts hit by main's rebuild-after-block-end bug (PR #168 follow-up).
--
-- Run once, after PR #168 merges, and only if detect-superseded-ended-blocks.sql check 1
-- (superseded_ended) or check 3 (block_number_sequence) lists real users:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/repair-superseded-ended-blocks.sql
--
-- ROOT CAUSE (main, fixed in PR #168): a Settings rebuild after a block had ended
-- (today > ends_on) called rebuild_block without rolling over first. rebuild_block took its
-- POST-block path: the ended block became 'superseded' (ended_on = p_today - 1 >= ends_on);
-- the new row started on p_today with week_offset carried (4+, "Week 5 of 4") and, because
-- main's rebuild keeps block_number, the SAME block_number as the ended block.
--
-- WHAT THIS SCRIPT DOES (per affected user):
--   1. Re-marks the wrongly superseded block 'completed' with ended_on = ends_on.
--   2. Resets the replacing block's week_offset to 0, as rollover would have. "Replacing"
--      means started on old.ended_on + 1 with the carried offset. That also covers a
--      later mid-block rebuild of it under today's rebuild_block, which keeps started_on
--      and week_offset.
--   3. Renumbers every user whose NON-superseded blocks are not numbered 1..N by started_on
--      (or who has a superseded row numbered above N). That covers the users from steps 1
--      and 2, whose replacing block is block 1 again, and accounts whose older rebuilds
--      consumed numbers (e.g. 17 rows numbered 1-13, so the real blocks show as "Block 12"
--      and "Block 13"). Only non-superseded blocks count, so they become 1..N. A superseded
--      row (a rebuild leftover, never shown) takes the number of the block that replaced
--      it, capped at N, so it never consumes a number. The next rollover
--      (max(block_number) + 1 over all rows) then gives N + 1.
--
-- NOT REPAIRED: a block past week 4 that step 2 cannot match safely, e.g. a replacing
-- block that was rebuilt again while migration 20261025000023 was live. That version
-- restarted the row on the rebuild day with the inflated offset carried, so the right
-- offset is a judgement call. detect check 2 (past_week_4) lists them for manual handling.
--
-- TRANSACTIONS: the whole repair is ONE statement (a DO block), with no BEGIN or COMMIT of
-- its own. Run on its own (psql autocommit), it is atomic: it all commits or none of it does.
-- Run inside a caller's transaction, it never commits that transaction; the caller decides.
-- This is how to do a dry run:
--   BEGIN;
--   \i scripts/sql/repair-superseded-ended-blocks.sql
--   \i scripts/sql/detect-superseded-ended-blocks.sql
--   ROLLBACK;
-- The per-user locks are held until the enclosing transaction ends.
--
-- SAFETY:
--   - Takes pg_advisory_xact_lock(hashtext('program_block:' || user_id)) for every affected
--     user (in user_id order) before reading their rows, the same per-user lock
--     rebuild_block and rollover_block take, so a member rebuilding or rolling over during
--     the run waits rather than racing it.
--   - Refuses to run if a unique index on programs covers block_number. None exists today:
--     the only unique index on programs is one active block per user, and that one doesn't
--     involve block_number. Sharing numbers between a superseded row and its replacement
--     relies on there being none, and so does step 3 being a single UPDATE.
--   - Idempotent: a second run (also within the same transaction) finds no targets and
--     changes nothing.
--   - Touches programs only (status, ended_on, week_offset, block_number), never sessions,
--     session_exercises or session_sets.

DO $repair$
DECLARE
  v_user uuid;
  v_targets int;
  v_completed int;
  v_offsets int;
  v_renumbered int;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
    WHERE ns.nspname = 'public' AND c.relname = 'programs' AND i.indisunique AND a.attname = 'block_number'
  ) THEN
    RAISE EXCEPTION 'programs has a unique index on block_number; renumbering needs a two-phase update';
  END IF;

  -- Lock every user the repair may touch: check-1 users and misnumbered users.
  CREATE TEMP TABLE _repair_users ON COMMIT DROP AS
  WITH ordered AS (
    SELECT
      p.id, p.user_id, p.status, p.block_number,
      COALESCE(SUM(CASE WHEN p.status <> 'superseded' THEN 1 ELSE 0 END) OVER (
        PARTITION BY p.user_id
        ORDER BY p.started_on, p.created_at, (p.status = 'superseded') DESC, p.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0) AS prior_blocks,
      SUM(CASE WHEN p.status <> 'superseded' THEN 1 ELSE 0 END) OVER (PARTITION BY p.user_id) AS real_blocks
    FROM public.programs p
    
  ), expected AS (
    SELECT
      o.*,
      CASE
        WHEN o.status <> 'superseded' THEN o.prior_blocks + 1
        ELSE LEAST(o.prior_blocks + 1, GREATEST(o.real_blocks, 1))
      END AS expected_block_number
    FROM ordered o
  ), misnumbered AS (
    SELECT e.user_id
    FROM expected e
    GROUP BY e.user_id
    HAVING bool_or(e.status <> 'superseded' AND e.block_number <> e.expected_block_number)
        OR bool_or(e.status = 'superseded' AND e.block_number > GREATEST(e.real_blocks, 1))
  )
  SELECT user_id FROM public.programs
  WHERE status = 'superseded' AND ended_on IS NOT NULL AND ended_on >= ends_on
  UNION
  SELECT user_id FROM misnumbered;

  FOR v_user IN SELECT user_id FROM _repair_users ORDER BY user_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('program_block:' || v_user::text));
  END LOOP;

  -- Repair targets, read after the locks are held. Dropped again before the block ends, so
  -- a second run in the same transaction can create it afresh.
  CREATE TEMP TABLE _repair_targets ON COMMIT DROP AS
  SELECT
    old.id AS old_id,
    old.user_id,
    new.id AS new_id,
    old.ends_on
  FROM public.programs old
  LEFT JOIN public.programs new ON new.user_id = old.user_id
    AND new.started_on = old.ended_on + 1
    AND new.id <> old.id
    AND new.week_offset = old.week_offset + FLOOR((new.started_on - old.started_on) / 7)
  WHERE old.status = 'superseded'
    AND old.ended_on IS NOT NULL
    AND old.ended_on >= old.ends_on
    AND old.user_id IN (SELECT user_id FROM _repair_users);
  SELECT COUNT(DISTINCT user_id) INTO v_targets FROM _repair_targets;

  -- Step 1: wrongly superseded blocks become completed on their natural end date.
  UPDATE public.programs p
  SET
    status = 'completed',
    ended_on = rt.ends_on
  FROM _repair_targets rt
  WHERE p.id = rt.old_id
    AND p.status = 'superseded';
  GET DIAGNOSTICS v_completed = ROW_COUNT;

  -- Step 2: replacing blocks restart the cycle at week 1.
  UPDATE public.programs p
  SET
    week_offset = 0
  FROM _repair_targets rt
  WHERE p.id = rt.new_id
    AND rt.new_id IS NOT NULL
    AND p.week_offset <> 0;
  GET DIAGNOSTICS v_offsets = ROW_COUNT;

  -- Step 3: renumber misnumbered users (computed after steps 1 and 2, among the locked
  -- users). Only non-superseded blocks count: they become 1..N by started_on. A superseded
  -- row (a rebuild leftover) takes the number of the block that replaced it, capped at N,
  -- so it never consumes a number and never raises max(block_number) for the next rollover.
  WITH ordered AS (
    SELECT
      p.id, p.user_id, p.status, p.block_number,
      COALESCE(SUM(CASE WHEN p.status <> 'superseded' THEN 1 ELSE 0 END) OVER (
        PARTITION BY p.user_id
        ORDER BY p.started_on, p.created_at, (p.status = 'superseded') DESC, p.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0) AS prior_blocks,
      SUM(CASE WHEN p.status <> 'superseded' THEN 1 ELSE 0 END) OVER (PARTITION BY p.user_id) AS real_blocks
    FROM public.programs p
    WHERE p.user_id IN (SELECT user_id FROM _repair_users)
  ), expected AS (
    SELECT
      o.*,
      CASE
        WHEN o.status <> 'superseded' THEN o.prior_blocks + 1
        ELSE LEAST(o.prior_blocks + 1, GREATEST(o.real_blocks, 1))
      END AS expected_block_number
    FROM ordered o
  ), misnumbered AS (
    SELECT e.user_id
    FROM expected e
    GROUP BY e.user_id
    HAVING bool_or(e.status <> 'superseded' AND e.block_number <> e.expected_block_number)
        OR bool_or(e.status = 'superseded' AND e.block_number > GREATEST(e.real_blocks, 1))
  )
  UPDATE public.programs p
  SET block_number = e.expected_block_number
  FROM expected e
  WHERE p.id = e.id
    AND e.user_id IN (SELECT user_id FROM misnumbered)
    AND p.block_number <> e.expected_block_number;
  GET DIAGNOSTICS v_renumbered = ROW_COUNT;

  DROP TABLE _repair_targets;
  DROP TABLE _repair_users;
  RAISE NOTICE 'repair: % superseded-ended user(s); % block(s) completed, % week_offset(s) reset, % block_number(s) changed',
    v_targets, v_completed, v_offsets, v_renumbered;
END
$repair$;

-- Verify: re-run detect-superseded-ended-blocks.sql. Checks 1 and 3 must return 0 rows;
-- users left in check 2 need manual handling.
