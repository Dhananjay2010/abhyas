-- Migration: Session length requires explicit save during onboarding
-- Date: 2026-10-25
-- 
-- This migration removes the DB default and NOT NULL constraint on preferred_session_minutes so that:
-- 1. The onboarding step only counts as 'done' once the user explicitly saves it
-- 2. The UI can default to 45 minutes instead of inheriting a DB default of 60
-- 3. Reloading /onboarding will land on the session-length step until the user saves
--
-- Existing users who already completed onboarding are unaffected because they have
-- a saved value from their explicit choice during onboarding.
--
-- New users created after this migration will have NULL until they explicitly save the value
-- during onboarding. The check constraint from migration 000019 still applies once a value
-- is set (must be 30, 45, 60, or 75).

-- Step 1: Remove NOT NULL constraint
ALTER TABLE profiles ALTER COLUMN preferred_session_minutes DROP NOT NULL;

-- Step 2: Drop the DB default
ALTER TABLE profiles ALTER COLUMN preferred_session_minutes DROP DEFAULT;

-- ============================================================================
-- SECTION 2: Block Management Functions - search_path hardening
-- ============================================================================
-- Recreate cycle_week_for, rebuild_block, and rollover_block with:
-- 1. SET search_path = '' to prevent search_path hijacking
-- 2. Fully schema-qualified references (public.*, pg_catalog.*)
-- 3. Fix rollover_block idempotency guard (was comparing started_on with own ends_on)
--
-- These changes clear 3 Supabase advisor warnings without altering function behavior.

-- Helper: compute cycle week for a given date in a block
CREATE OR REPLACE FUNCTION public.cycle_week_for(
  p_week_offset pg_catalog.int4,
  p_started_on pg_catalog.date,
  p_date pg_catalog.date
) RETURNS pg_catalog.int4
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_week_offset + pg_catalog.floor((p_date - p_started_on) / 7) + 1;
$$;

-- rebuild_block: Retire active block as 'superseded', insert new block
-- SECURITY INVOKER: RLS applies, uses auth.uid()
CREATE OR REPLACE FUNCTION public.rebuild_block(
  p_today pg_catalog.date,
  p_payload pg_catalog.jsonb
) RETURNS pg_catalog.uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id pg_catalog.uuid := auth.uid();
  v_old_block RECORD;
  v_new_week_offset pg_catalog.int4;
  v_new_program_id pg_catalog.uuid;
  v_program_day_id pg_catalog.uuid;
  v_day pg_catalog.jsonb;
  v_exercise pg_catalog.jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Serialize concurrent calls per user with advisory lock
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('rebuild:' || v_user_id::pg_catalog.text));

  -- Re-read the active block after acquiring lock
  SELECT id, started_on, week_offset
  INTO v_old_block
  FROM public.programs
  WHERE user_id = v_user_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active block to rebuild';
  END IF;

  -- IDEMPOTENT: if an active block already started on p_today with the SAME payload id, return it
  IF v_old_block.started_on = p_today AND v_old_block.id = (p_payload->>'id')::pg_catalog.uuid THEN
    RETURN v_old_block.id;
  END IF;

  -- Compute new week_offset: carry over the current cycle week
  v_new_week_offset := (
    v_old_block.week_offset +
    pg_catalog.floor((p_today - v_old_block.started_on) / 7)
  );

  -- Retire the old block as 'superseded'
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
    (p_payload->>'id')::pg_catalog.uuid,
    v_user_id,
    (p_payload->>'block_number')::pg_catalog.int4,
    (p_payload->>'split_type')::public.split_type,
    (p_payload->>'days_per_week')::pg_catalog.int4,
    (p_payload->>'primary_track')::public.track_type,
    (p_payload->>'goal')::public.fitness_goal,
    (p_payload->>'level')::public.fitness_level,
    p_today,
    (p_payload->>'ends_on')::pg_catalog.date,
    (p_payload->>'deload_week')::pg_catalog.int4,
    v_new_week_offset,
    'active'
  ) RETURNING id INTO v_new_program_id;

  -- Insert program_days
  FOR v_day IN SELECT * FROM pg_catalog.jsonb_array_elements(p_payload->'days')
  LOOP
    INSERT INTO public.program_days (
      program_id, user_id, day_index, day_type, focus, label
    ) VALUES (
      v_new_program_id,
      v_user_id,
      (v_day->>'day_index')::pg_catalog.int4,
      (v_day->>'day_type')::public.day_type,
      v_day->>'focus',
      v_day->>'label'
    ) RETURNING id INTO v_program_day_id;

    -- Insert program_day_exercises for this day
    FOR v_exercise IN SELECT * FROM pg_catalog.jsonb_array_elements(v_day->'exercises')
    LOOP
      INSERT INTO public.program_day_exercises (
        program_day_id, user_id, exercise_id, order_index,
        target_sets, target_reps_min, target_reps_max, rest_seconds
      ) VALUES (
        v_program_day_id,
        v_user_id,
        (v_exercise->>'exercise_id')::pg_catalog.uuid,
        (v_exercise->>'order_index')::pg_catalog.int4,
        (v_exercise->>'target_sets')::pg_catalog.int4,
        (v_exercise->>'target_reps_min')::pg_catalog.int4,
        (v_exercise->>'target_reps_max')::pg_catalog.int4,
        (v_exercise->>'rest_seconds')::pg_catalog.int4
      );
    END LOOP;
  END LOOP;

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

-- rollover_block: Retire active block as 'completed', insert new block
-- SECURITY INVOKER: RLS applies, uses auth.uid()
-- IDEMPOTENCY FIX: Check if there's already a completed predecessor ending on ends_on
--                  and the active block started on ends_on + 1 (successor exists)
CREATE OR REPLACE FUNCTION public.rollover_block(
  p_today pg_catalog.date,
  p_payload pg_catalog.jsonb
) RETURNS pg_catalog.uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id pg_catalog.uuid := auth.uid();
  v_old_block RECORD;
  v_new_started_on pg_catalog.date;
  v_new_program_id pg_catalog.uuid;
  v_program_day_id pg_catalog.uuid;
  v_day pg_catalog.jsonb;
  v_exercise pg_catalog.jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Serialize concurrent calls per user with advisory lock
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('rollover:' || v_user_id::pg_catalog.text));

  -- Re-read the active block after acquiring lock
  SELECT id, started_on, ends_on
  INTO v_old_block
  FROM public.programs
  WHERE user_id = v_user_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active block to roll over';
  END IF;

  -- IDEMPOTENT: check if rollover already happened for this block transition
  -- If there's a completed/superseded block with ended_on = ends_on,
  -- and the active block started the next day, we've already rolled over
  IF EXISTS (
    SELECT 1 FROM public.programs
    WHERE user_id = v_user_id
      AND status IN ('completed', 'superseded')
      AND ended_on = v_old_block.ends_on
  ) AND v_old_block.started_on = v_old_block.ends_on + 1 THEN
    -- Rollover already happened; return the current active successor
    RETURN v_old_block.id;
  END IF;

  -- Guard: if p_today <= ends_on, block hasn't ended yet
  IF p_today <= v_old_block.ends_on THEN
    RETURN v_old_block.id;
  END IF;

  -- New block starts the day after the old one ends
  v_new_started_on := v_old_block.ends_on + 1;

  -- Retire the old block as 'completed'
  UPDATE public.programs
  SET
    status = 'completed',
    ended_on = v_old_block.ends_on
  WHERE id = v_old_block.id;

  -- Insert new program (week_offset stays 0 for rollover)
  INSERT INTO public.programs (
    id, user_id, block_number, split_type, days_per_week,
    primary_track, goal, level, started_on, ends_on,
    deload_week, week_offset, status
  ) VALUES (
    (p_payload->>'id')::pg_catalog.uuid,
    v_user_id,
    (p_payload->>'block_number')::pg_catalog.int4,
    (p_payload->>'split_type')::public.split_type,
    (p_payload->>'days_per_week')::pg_catalog.int4,
    (p_payload->>'primary_track')::public.track_type,
    (p_payload->>'goal')::public.fitness_goal,
    (p_payload->>'level')::public.fitness_level,
    v_new_started_on,
    (p_payload->>'ends_on')::pg_catalog.date,
    (p_payload->>'deload_week')::pg_catalog.int4,
    0,
    'active'
  ) RETURNING id INTO v_new_program_id;

  -- Insert program_days
  FOR v_day IN SELECT * FROM pg_catalog.jsonb_array_elements(p_payload->'days')
  LOOP
    INSERT INTO public.program_days (
      program_id, user_id, day_index, day_type, focus, label
    ) VALUES (
      v_new_program_id,
      v_user_id,
      (v_day->>'day_index')::pg_catalog.int4,
      (v_day->>'day_type')::public.day_type,
      v_day->>'focus',
      v_day->>'label'
    ) RETURNING id INTO v_program_day_id;

    -- Insert program_day_exercises for this day
    FOR v_exercise IN SELECT * FROM pg_catalog.jsonb_array_elements(v_day->'exercises')
    LOOP
      INSERT INTO public.program_day_exercises (
        program_day_id, user_id, exercise_id, order_index,
        target_sets, target_reps_min, target_reps_max, rest_seconds
      ) VALUES (
        v_program_day_id,
        v_user_id,
        (v_exercise->>'exercise_id')::pg_catalog.uuid,
        (v_exercise->>'order_index')::pg_catalog.int4,
        (v_exercise->>'target_sets')::pg_catalog.int4,
        (v_exercise->>'target_reps_min')::pg_catalog.int4,
        (v_exercise->>'target_reps_max')::pg_catalog.int4,
        (v_exercise->>'rest_seconds')::pg_catalog.int4
      );
    END LOOP;
  END LOOP;

  RETURN v_new_program_id;
END;
$$;

COMMENT ON FUNCTION public.cycle_week_for IS 'Compute cycle week for a date within a program block. search_path hardened.';
COMMENT ON FUNCTION public.rebuild_block IS 'Rebuild the active block: retire as superseded, insert new block with carried-over week_offset. Idempotent. search_path hardened.';
COMMENT ON FUNCTION public.rollover_block IS 'Roll over to a new block: retire as completed, insert new block starting after the old one ends. Idempotent with corrected guard. search_path hardened.';
