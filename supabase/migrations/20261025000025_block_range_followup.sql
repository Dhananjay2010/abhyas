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
-- M1: Mid-block rebuild should end with the carried cycle
-- M2: Same-day rebuild updates program_days in place
-- Fix: Calculate ends_on to complete the current cycle (4 weeks)
-- Fix: Update program_days by day_index instead of deleting
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
  v_cycle_length int := 4;  -- standard 4-week cycle
  v_remaining_weeks int;
  v_new_ends_on date;
  v_new_program_id uuid;
  v_program_day_id uuid;
  v_day jsonb;
  v_exercise jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- M1: Unified advisory lock per user (same key as rollover_block)
  PERFORM pg_advisory_xact_lock(hashtext('program_block:' || v_user_id::text));

  -- Re-read the active block after acquiring lock
  SELECT id, started_on, week_offset
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

  -- Compute new week_offset: carry over the current cycle week
  v_new_week_offset := (
    v_old_block.week_offset +
    FLOOR((p_today - v_old_block.started_on) / 7)
  );

  -- M1 FIX: Calculate ends_on to end with cycle week 4
  -- If offset >= cycle_length, start fresh cycle (week_offset = offset mod cycle_length)
  -- This prevents ends_on < started_on for late returns
  IF v_new_week_offset >= v_cycle_length THEN
    -- Late return: start fresh cycle
    v_new_week_offset := v_new_week_offset % v_cycle_length;
  END IF;
  
  -- Calculate remaining weeks in cycle
  v_remaining_weeks := v_cycle_length - v_new_week_offset;
  
  -- ends_on = started_on + (remaining_weeks * 7 - 1 days)
  v_new_ends_on := p_today + (v_remaining_weeks * 7 - 1);

  -- L4 & M2 FIX: If started_on = p_today, update in place AND update program_days by day_index
  -- to preserve sessions.program_day_id foreign keys (ON DELETE SET NULL would orphan sessions)
  IF v_old_block.started_on = p_today THEN
    -- Update the program row with new payload (keep same id for FK integrity)
    UPDATE public.programs
    SET
      block_number = (p_payload->>'block_number')::int,
      split_type = (p_payload->>'split_type')::public.split_type,
      days_per_week = (p_payload->>'days_per_week')::int,
      primary_track = (p_payload->>'primary_track')::public.track_type,
      goal = (p_payload->>'goal')::public.fitness_goal,
      level = (p_payload->>'level')::public.fitness_level,
      ends_on = v_new_ends_on,  -- Use calculated cycle-aware ends_on
      deload_week = (p_payload->>'deload_week')::int,
      week_offset = v_new_week_offset
    WHERE id = v_old_block.id;
    
    -- M2 FIX: Update program_days in place by day_index instead of deleting
    -- This preserves sessions.program_day_id foreign key relationships
    FOR v_day IN SELECT * FROM jsonb_array_elements(p_payload->'days')
    LOOP
      -- Try to update existing program_day for this day_index
      UPDATE public.program_days
      SET
        day_type = (v_day->>'day_type')::public.day_type,
        focus = v_day->>'focus',
        label = v_day->>'label'
      WHERE program_id = v_old_block.id AND day_index = (v_day->>'day_index')::int;
      
      -- If no row was updated, insert it
      IF NOT FOUND THEN
        INSERT INTO public.program_days (
          program_id, user_id, day_index, day_type, focus, label
        ) VALUES (
          v_old_block.id,
          v_user_id,
          (v_day->>'day_index')::int,
          (v_day->>'day_type')::public.day_type,
          v_day->>'focus',
          v_day->>'label'
        );
      END IF;
      
      -- Delete old exercises for this day and insert new ones
      DELETE FROM public.program_day_exercises
      WHERE program_day_id IN (
        SELECT id FROM public.program_days 
        WHERE program_id = v_old_block.id AND day_index = (v_day->>'day_index')::int
      );
      
      SELECT id INTO v_program_day_id
      FROM public.program_days
      WHERE program_id = v_old_block.id AND day_index = (v_day->>'day_index')::int;
      
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
    
    -- Delete program_days not in the new payload
    DELETE FROM public.program_days
    WHERE program_id = v_old_block.id
    AND day_index NOT IN (
      SELECT (value->>'day_index')::int
      FROM jsonb_array_elements(p_payload->'days')
    );
    
    -- Return the existing program id (not the payload id)
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
      p_today,
      v_new_ends_on,  -- Use calculated cycle-aware ends_on
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

COMMENT ON FUNCTION rebuild_block IS 'Rebuild the active block: retire as superseded, insert new block with carried-over week_offset. ends_on calculated to end with cycle week 4 (offset mod 4 for late returns). Same-day rebuilds update in place and preserve sessions.program_day_id. Idempotent.';

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
