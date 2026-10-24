-- Hotfix for program block range bugs from #74
-- Addresses: H1 (week_offset ignored in TS), H2 (late return backdating),
-- M1 (unified advisory lock), L1 (dead idempotency guard), L3 (revoke anon),
-- L4 (repeat same-day rebuild rows), and security advisor warnings.
--
-- IDEMPOTENT: safe to run multiple times.
-- NO DATA REPAIR: schema and function changes only.

-- ============================================================
-- Security: revoke from anon/PUBLIC, grant to authenticated
-- ============================================================

-- cycle_week_for helper
do $$
begin
  if has_function_privilege('anon', 'cycle_week_for(int,date,date)', 'execute') then
    revoke execute on function cycle_week_for(int,date,date) from anon, public;
  end if;
end$$;
grant execute on function cycle_week_for(int,date,date) to authenticated, service_role;

-- rebuild_block
do $$
begin
  if has_function_privilege('anon', 'rebuild_block(date,jsonb)', 'execute') then
    revoke execute on function rebuild_block(date,jsonb) from anon, public;
  end if;
end$$;
grant execute on function rebuild_block(date,jsonb) to authenticated, service_role;

-- rollover_block
do $$
begin
  if has_function_privilege('anon', 'rollover_block(date,jsonb)', 'execute') then
    revoke execute on function rollover_block(date,jsonb) from anon, public;
  end if;
end$$;
grant execute on function rollover_block(date,jsonb) to authenticated, service_role;

-- ============================================================
-- Fix cycle_week_for: add search_path security
-- ============================================================
create or replace function cycle_week_for(
  p_week_offset int,
  p_started_on date,
  p_date date
) returns int
language sql immutable
security definer
set search_path = ''
as $$
  select p_week_offset + floor((p_date - p_started_on) / 7) + 1;
$$;

-- ============================================================
-- Fix rebuild_block: unified lock, no empty superseded rows, search_path
-- ============================================================
create or replace function rebuild_block(
  p_today date,
  p_payload jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_block record;
  v_new_week_offset int;
  v_new_program_id uuid;
  v_program_day_id uuid;
  v_day jsonb;
  v_exercise jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- M1: Unified advisory lock per user (same key as rollover_block)
  perform pg_advisory_xact_lock(public.hashtext('program_block:' || v_user_id::text));

  -- Re-read the active block after acquiring lock
  select id, started_on, week_offset
  into v_old_block
  from public.programs
  where user_id = v_user_id and status = 'active';

  if not found then
    raise exception 'No active block to rebuild';
  end if;

  -- IDEMPOTENT: if an active block already started on p_today with the SAME payload id, return it
  if v_old_block.started_on = p_today and v_old_block.id = (p_payload->>'id')::uuid then
    return v_old_block.id;
  end if;

  -- L4: If started_on = p_today but DIFFERENT payload id, update in place instead of creating empty superseded row
  if v_old_block.started_on = p_today then
    -- Update the existing block with new payload data
    update public.programs
    set
      id = (p_payload->>'id')::uuid,
      block_number = (p_payload->>'block_number')::int,
      split_type = (p_payload->>'split_type')::split_type,
      days_per_week = (p_payload->>'days_per_week')::int,
      primary_track = (p_payload->>'primary_track')::track_type,
      goal = (p_payload->>'goal')::fitness_goal,
      level = (p_payload->>'level')::fitness_level,
      ends_on = (p_payload->>'ends_on')::date,
      deload_week = (p_payload->>'deload_week')::int
    where id = v_old_block.id;

    -- Delete old program_days and their exercises
    delete from public.program_day_exercises where program_day_id in (
      select id from public.program_days where program_id = v_old_block.id
    );
    delete from public.program_days where program_id = v_old_block.id;

    v_new_program_id := (p_payload->>'id')::uuid;
  else
    -- Different day: compute new week_offset and supersede old block
    v_new_week_offset := (
      v_old_block.week_offset +
      floor((p_today - v_old_block.started_on) / 7)
    );

    -- Retire the old block as 'superseded'
    update public.programs
    set
      status = 'superseded',
      ended_on = p_today - 1
    where id = v_old_block.id;

    -- Insert new program
    insert into public.programs (
      id, user_id, block_number, split_type, days_per_week,
      primary_track, goal, level, started_on, ends_on,
      deload_week, week_offset, status
    ) values (
      (p_payload->>'id')::uuid,
      v_user_id,
      (p_payload->>'block_number')::int,
      (p_payload->>'split_type')::split_type,
      (p_payload->>'days_per_week')::int,
      (p_payload->>'primary_track')::track_type,
      (p_payload->>'goal')::fitness_goal,
      (p_payload->>'level')::fitness_level,
      p_today,
      (p_payload->>'ends_on')::date,
      (p_payload->>'deload_week')::int,
      v_new_week_offset,
      'active'
    ) returning id into v_new_program_id;
  end if;

  -- Insert program_days
  for v_day in select * from jsonb_array_elements(p_payload->'days')
  loop
    insert into public.program_days (
      program_id, user_id, day_index, day_type, focus, label
    ) values (
      v_new_program_id,
      v_user_id,
      (v_day->>'day_index')::int,
      (v_day->>'day_type')::day_type,
      v_day->>'focus',
      v_day->>'label'
    ) returning id into v_program_day_id;

    -- Insert program_day_exercises for this day
    for v_exercise in select * from jsonb_array_elements(v_day->'exercises')
    loop
      insert into public.program_day_exercises (
        program_day_id, user_id, exercise_id, order_index,
        target_sets, target_reps_min, target_reps_max, rest_seconds
      ) values (
        v_program_day_id,
        v_user_id,
        (v_exercise->>'exercise_id')::uuid,
        (v_exercise->>'order_index')::int,
        (v_exercise->>'target_sets')::int,
        (v_exercise->>'target_reps_min')::int,
        (v_exercise->>'target_reps_max')::int,
        (v_exercise->>'rest_seconds')::int
      );
    end loop;
  end loop;

  return v_new_program_id;
exception
  when unique_violation then
    -- Another concurrent call won; return the active block it created
    select id into v_new_program_id
    from public.programs
    where user_id = v_user_id and status = 'active';
    return v_new_program_id;
end;
$$;

-- ============================================================
-- Fix rollover_block: unified lock, late return fix, real idempotency, search_path
-- ============================================================
create or replace function rollover_block(
  p_today date,
  p_payload jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_block record;
  v_new_started_on date;
  v_new_program_id uuid;
  v_program_day_id uuid;
  v_day jsonb;
  v_exercise jsonb;
  v_block_length int := 28; -- standard block length in days
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- M1: Unified advisory lock per user (same key as rebuild_block)
  perform pg_advisory_xact_lock(public.hashtext('program_block:' || v_user_id::text));

  -- Re-read the active block after acquiring lock
  select id, started_on, ends_on
  into v_old_block
  from public.programs
  where user_id = v_user_id and status = 'active';

  if not found then
    raise exception 'No active block to roll over';
  end if;

  -- L1: Real idempotency check - if active block already has the payload id, rollover already happened
  if v_old_block.id = (p_payload->>'id')::uuid then
    return v_old_block.id;
  end if;
  
  -- Check if current block hasn't ended yet (p_today <= ends_on)
  if p_today <= v_old_block.ends_on then
    -- Block is still active, no rollover needed
    return v_old_block.id;
  end if;

  -- H2: Late return fix - if p_today is more than 1 day after ends_on, start fresh on p_today
  -- Otherwise, start the day after the old block ends (normal rollover)
  if p_today > v_old_block.ends_on + 1 then
    -- Late return: start new block on p_today at Week 1 with standard 28-day length
    v_new_started_on := p_today;
  else
    -- Normal rollover: start the day after old block ends
    v_new_started_on := v_old_block.ends_on + 1;
  end if;

  -- Retire the old block as 'completed'
  update public.programs
  set
    status = 'completed',
    ended_on = v_old_block.ends_on
  where id = v_old_block.id;

  -- Insert new program (week_offset stays 0 for rollover)
  insert into public.programs (
    id, user_id, block_number, split_type, days_per_week,
    primary_track, goal, level, started_on, ends_on,
    deload_week, week_offset, status
  ) values (
    (p_payload->>'id')::uuid,
    v_user_id,
    (p_payload->>'block_number')::int,
    (p_payload->>'split_type')::split_type,
    (p_payload->>'days_per_week')::int,
    (p_payload->>'primary_track')::track_type,
    (p_payload->>'goal')::fitness_goal,
    (p_payload->>'level')::fitness_level,
    v_new_started_on,
    -- H2: Use p_today + 27 days (28-day block) for late returns, otherwise use payload ends_on
    case
      when p_today > v_old_block.ends_on + 1 then p_today + (v_block_length - 1)
      else (p_payload->>'ends_on')::date
    end,
    (p_payload->>'deload_week')::int,
    0,
    'active'
  ) returning id into v_new_program_id;

  -- Insert program_days
  for v_day in select * from jsonb_array_elements(p_payload->'days')
  loop
    insert into public.program_days (
      program_id, user_id, day_index, day_type, focus, label
    ) values (
      v_new_program_id,
      v_user_id,
      (v_day->>'day_index')::int,
      (v_day->>'day_type')::day_type,
      v_day->>'focus',
      v_day->>'label'
    ) returning id into v_program_day_id;

    -- Insert program_day_exercises for this day
    for v_exercise in select * from jsonb_array_elements(v_day->'exercises')
    loop
      insert into public.program_day_exercises (
        program_day_id, user_id, exercise_id, order_index,
        target_sets, target_reps_min, target_reps_max, rest_seconds
      ) values (
        v_program_day_id,
        v_user_id,
        (v_exercise->>'exercise_id')::uuid,
        (v_exercise->>'order_index')::int,
        (v_exercise->>'target_sets')::int,
        (v_exercise->>'target_reps_min')::int,
        (v_exercise->>'target_reps_max')::int,
        (v_exercise->>'rest_seconds')::int
      );
    end loop;
  end loop;

  return v_new_program_id;
end;
$$;

comment on function rebuild_block is 'Rebuild the active block: retire as superseded, insert new block with carried-over week_offset. Same-day rebuilds update in place. Idempotent.';
comment on function rollover_block is 'Roll over to a new block: retire as completed, insert new block. Late returns (>1 day after ends_on) start fresh on p_today. Idempotent.';
