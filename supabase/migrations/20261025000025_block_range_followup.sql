-- Block range followup fixes: M1, M2, M3, TZ-1, LOW, Rows #1
-- Addresses QA findings from PR #100 deployment
--
-- IDEMPOTENT: safe to run multiple times
-- NO DATA DELETION: marks invalid completed programs as superseded

-- ============================================================
-- LOW/advisor: cycle_week_for SECURITY INVOKER (not DEFINER)
-- LOW: Clamp to week 1 for dates before started_on
-- ============================================================
CREATE OR REPLACE FUNCTION cycle_week_for(
  p_week_offset int,
  p_started_on date,
  p_date date
) RETURNS int
LANGUAGE sql IMMUTABLE
SECURITY INVOKER  -- Changed from DEFINER per security advisor
SET search_path = ''
AS $$
  -- Clamp to week 1 for dates before started_on
  SELECT CASE 
    WHEN p_date < p_started_on THEN 1
    ELSE p_week_offset + FLOOR((p_date - p_started_on) / 7) + 1
  END;
$$;

COMMENT ON FUNCTION cycle_week_for IS 'Compute cycle week for a date within a block. Week 1 starts on started_on. Clamps to week 1 for dates before start.';

-- ============================================================
-- M1: Mid-block rebuild PRESERVES original started_on, ends_on, week_offset
-- M2: Same-day rebuild PRESERVES program_days for completed sessions
-- 
-- BASED ON: 20261025000023_block_ranges_hotfix.sql
-- 
-- CHANGES FROM 000023:
-- + M1: If p_today <= v_old_block.ends_on (mid-block), keep started_on, ends_on, week_offset unchanged
-- + M2: Mark old program_days as 'superseded' and create new ones (preserves History labels)
-- 
-- PRESERVED FROM 000023:
-- - pg_advisory_xact_lock (unified lock)
-- - Idempotency check (same payload id)
-- - Same-day in-place update (program.id preserved)
-- - Exception handler for unique_violation
-- - SECURITY INVOKER + SET search_path = ''
-- ============================================================
CREATE OR REPLACE FUNCTION rebuild_block(
  p_today date,
  p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_old_block record;
  v_new_week_offset int;
  v_new_started_on date;
  v_new_ends_on date;
  v_is_mid_block boolean;
  v_new_program_id uuid;
  v_program_day_id uuid;
  v_day jsonb;
  v_exercise jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Unified advisory lock per user (same key as rollover_block)
  PERFORM pg_advisory_xact_lock(hashtext('program_block:' || v_user_id::text));

  -- Re-read the active block after acquiring lock
  SELECT id, started_on, ends_on, week_offset
  INTO v_old_block
  FROM public.programs
  WHERE user_id = v_user_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active block to rebuild';
  END IF;

  -- IDEMPOTENT: if an active block already started on p_today with the SAME payload id, return it
  IF v_old_block.started_on = p_today AND v_old_block.id = (p_payload->>'id')::uuid THEN
    RETURN v_old_block.id;
  END IF;

  -- M1: Check if this is a mid-block rebuild (p_today <= old block's ends_on)
  v_is_mid_block := (p_today <= v_old_block.ends_on);

  IF v_is_mid_block THEN
    -- M1 FIX: Mid-block rebuild preserves original dates and week boundaries
    -- This keeps the deload on the same weekday and prevents "Week N > cycle_length"
    v_new_started_on := v_old_block.started_on;
    v_new_ends_on := v_old_block.ends_on;
    v_new_week_offset := v_old_block.week_offset;
  ELSE
    -- Post-block rebuild: calculate new offset and dates
    v_new_started_on := p_today;
    
    -- Compute new week_offset: carry over the current cycle week
    v_new_week_offset := (
      v_old_block.week_offset +
      FLOOR((p_today - v_old_block.started_on) / 7)
    );
    
    -- For late returns (offset >= 4), start fresh cycle
    IF v_new_week_offset >= 4 THEN
      v_new_week_offset := v_new_week_offset % 4;
    END IF;
    
    -- Calculate ends_on to complete the cycle
    v_new_ends_on := v_new_started_on + ((4 - v_new_week_offset) * 7 - 1);
  END IF;

  -- Same-day rebuild: update in place and preserve program_days for completed sessions
  IF v_old_block.started_on = p_today THEN
    -- Update the program row (keep same id for FK integrity)
    UPDATE public.programs
    SET
      block_number = (p_payload->>'block_number')::int,
      split_type = (p_payload->>'split_type')::public.split_type,
      days_per_week = (p_payload->>'days_per_week')::int,
      primary_track = (p_payload->>'primary_track')::public.track_type,
      goal = (p_payload->>'goal')::public.fitness_goal,
      level = (p_payload->>'level')::public.fitness_level,
      ends_on = v_new_ends_on,
      deload_week = (p_payload->>'deload_week')::int,
      week_offset = v_new_week_offset
    WHERE id = v_old_block.id;
    
    -- M2 FIX: Mark old program_days as superseded (preserves History labels)
    -- Don't delete rows that completed sessions reference
    UPDATE public.program_days
    SET status = 'superseded'
    WHERE program_id = v_old_block.id;
    
    -- Insert NEW program_days for the rebuilt block
    FOR v_day IN SELECT * FROM jsonb_array_elements(p_payload->'days')
    LOOP
      INSERT INTO public.program_days (
        program_id, user_id, day_index, day_type, focus, label, status
      ) VALUES (
        v_old_block.id,
        v_user_id,
        (v_day->>'day_index')::int,
        (v_day->>'day_type')::public.day_type,
        v_day->>'focus',
        v_day->>'label',
        'active'
      ) RETURNING id INTO v_program_day_id;
      
      -- Insert program_day_exercises for this day
      FOR v_exercise IN SELECT * FROM jsonb_array_elements(v_day->'exercises')
      LOOP
        INSERT INTO public.program_day_exercises (
          program_day_id, user_id, exercise_id, order_index,
          target_sets, target_reps_min, target_reps_max, rest_seconds
        ) VALUES (
          v_program_day_id,
          v_user_id,
          (v_exercise->>'exercise_id')::uuid,
          (v_exercise->>'order_index')::int,
          (v_exercise->>'target_sets')::int,
          (v_exercise->>'target_reps_min')::int,
          (v_exercise->>'target_reps_max')::int,
          (v_exercise->>'rest_seconds')::int
        );
      END LOOP;
    END LOOP;
    
    v_new_program_id := v_old_block.id;
  ELSE
    -- Different day: retire the old block as 'superseded'
    UPDATE public.programs
    SET
      status = 'superseded',
      ended_on = p_today - 1
    WHERE id = v_old_block.id;

    -- Insert new program
    INSERT INTO public.programs (
      id, user_id, block_number, split_type, days_per_week,
      primary_track, goal, level, started_on, ends_on,
      deload_week, week_offset, status
    ) VALUES (
      (p_payload->>'id')::uuid,
      v_user_id,
      (p_payload->>'block_number')::int,
      (p_payload->>'split_type')::public.split_type,
      (p_payload->>'days_per_week')::int,
      (p_payload->>'primary_track')::public.track_type,
      (p_payload->>'goal')::public.fitness_goal,
      (p_payload->>'level')::public.fitness_level,
      v_new_started_on,
      v_new_ends_on,
      (p_payload->>'deload_week')::int,
      v_new_week_offset,
      'active'
    ) RETURNING id INTO v_new_program_id;

    -- Insert program_days
    FOR v_day IN SELECT * FROM jsonb_array_elements(p_payload->'days')
    LOOP
      INSERT INTO public.program_days (
        program_id, user_id, day_index, day_type, focus, label
      ) VALUES (
        v_new_program_id,
        v_user_id,
        (v_day->>'day_index')::int,
        (v_day->>'day_type')::public.day_type,
        v_day->>'focus',
        v_day->>'label'
      ) RETURNING id INTO v_program_day_id;

      -- Insert program_day_exercises for this day
      FOR v_exercise IN SELECT * FROM jsonb_array_elements(v_day->'exercises')
      LOOP
        INSERT INTO public.program_day_exercises (
          program_day_id, user_id, exercise_id, order_index,
          target_sets, target_reps_min, target_reps_max, rest_seconds
        ) VALUES (
          v_program_day_id,
          v_user_id,
          (v_exercise->>'exercise_id')::uuid,
          (v_exercise->>'order_index')::int,
          (v_exercise->>'target_sets')::int,
          (v_exercise->>'target_reps_min')::int,
          (v_exercise->>'target_reps_max')::int,
          (v_exercise->>'rest_seconds')::int
        );
      END LOOP;
    END LOOP;
  END IF;

  RETURN v_new_program_id;
EXCEPTION
  WHEN unique_violation THEN
    -- Another concurrent call won; return the active block it created
    SELECT id INTO v_new_program_id
    FROM public.programs
    WHERE user_id = v_user_id AND status = 'active';
    RETURN v_new_program_id;
END;
$$;

COMMENT ON FUNCTION rebuild_block IS 'Rebuild the active block. Mid-block rebuilds (p_today <= ends_on) preserve started_on, ends_on, and week_offset. Same-day rebuilds mark old program_days as superseded and create new ones (preserves History labels). Idempotent.';

-- ============================================================
-- M2: Add status column to program_days for superseded days
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'program_days'
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.program_days 
    ADD COLUMN status text DEFAULT 'active' NOT NULL;
    
    CREATE INDEX IF NOT EXISTS program_days_status_idx 
    ON public.program_days(status) 
    WHERE status = 'active';
  END IF;
END$$;

-- ============================================================
-- Rows #1: Repair historical invalid completed programs
-- 
-- ROOT CAUSE: Pre-hotfix rebuild logic in src/lib/program/persist.ts
-- line 259: `.update({ status: "completed" })` for "first builds"
-- (before rebuild_block RPC was created). When a mid-block rebuild
-- happened, the TypeScript code marked the old block 'completed'
-- but did not set ended_on. Migration 20261025000010 then backfilled
-- ended_on = (next block's started_on) - 1, creating invalid ranges
-- when the next block started on the same day (ended_on = started_on - 1).
--
-- FIX: Mark these programs as 'superseded' (not deleted, preserves history).
-- ended_on = started_on - 1 means they are superseded empty ranges that
-- blockForDate will ignore (ended_on < date for all dates >= started_on).
-- No overlaps created because ended_on < started_on means no date is covered.
-- ============================================================

-- Count affected rows for logging
DO $$
DECLARE
  v_count int;
  v_with_sessions int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.programs
  WHERE status = 'completed' AND ended_on = started_on - 1;
  
  IF v_count > 0 THEN
    RAISE NOTICE 'Found % completed programs with ended_on = started_on - 1', v_count;
    
    SELECT COUNT(*) INTO v_with_sessions
    FROM public.programs p
    WHERE p.status = 'completed' AND p.ended_on = p.started_on - 1
    AND EXISTS (SELECT 1 FROM public.sessions s WHERE s.program_id = p.id);
    
    RAISE NOTICE '  % with sessions', v_with_sessions;
    RAISE NOTICE '  % without sessions', v_count - v_with_sessions;
  END IF;
END$$;

-- Mark as superseded (preserves history, no data loss)
-- ended_on stays started_on - 1, which means blockForDate will not match them
-- (ended_on < date for all dates >= started_on, so coversDate returns false)
UPDATE public.programs
SET status = 'superseded'
WHERE status = 'completed' 
AND ended_on = started_on - 1;

-- Log completion
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM public.programs
  WHERE status = 'completed' AND ended_on = started_on - 1;
  
  IF v_remaining = 0 THEN
    RAISE NOTICE 'Repair complete: 0 invalid completed programs remain';
  ELSE
    RAISE WARNING 'Repair incomplete: % invalid completed programs remain', v_remaining;
  END IF;
END$$;
