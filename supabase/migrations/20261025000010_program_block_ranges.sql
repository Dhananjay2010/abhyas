-- Program block ranges: fix mid-block rebuild and concurrent rollover
--
-- LEGACY BEHAVIOR:
-- Old rebuilds kept the same started_on and marked the old block 'completed'.
-- This migration backfills ended_on for those completed blocks, and they become
-- empty ranges (ended_on < started_on) because the new block reused the date.
-- No legacy rows become 'superseded' -- that status is only for future rebuilds.
--
-- IDEMPOTENT: safe to run multiple times; changes are guarded where practical.

-- 1. Add new columns
alter table programs
  add column if not exists ended_on date,
  add column if not exists week_offset int not null default 0;

-- 2. Extend the status enum to include 'superseded'
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    where t.typname = 'program_status' and e.enumlabel = 'superseded'
  ) then
    alter type program_status add value 'superseded';
  end if;
end$$;

-- 3. Dedupe: keep the newest active block per user, mark others 'completed'
--    (Newest = latest started_on, breaking ties by created_at DESC)
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by started_on desc, created_at desc
    ) as rn
  from programs
  where status = 'active'
)
update programs p
set status = 'completed'
from ranked r
where p.id = r.id and r.rn > 1;

-- 4. Backfill ended_on for non-active blocks
--    ended_on = (next block's started_on) - 1
--    If that gives ended_on < started_on, it's an empty range (legacy rebuild)
with next_starts as (
  select
    p1.id,
    p1.started_on,
    p1.user_id,
    (
      select p2.started_on
      from programs p2
      where p2.user_id = p1.user_id
        and (p2.started_on > p1.started_on
             or (p2.started_on = p1.started_on and p2.created_at > p1.created_at))
      order by p2.started_on, p2.created_at
      limit 1
    ) as next_started_on
  from programs p1
  where p1.status != 'active' and p1.ended_on is null
)
update programs p
set ended_on = (ns.next_started_on::date - interval '1 day')::date
from next_starts ns
where p.id = ns.id and ns.next_started_on is not null;

-- 5. Add partial unique index (idempotent: reuse if exists)
create unique index if not exists programs_one_active_per_user
  on programs (user_id) where (status = 'active');

-- 6. Add CHECK constraint
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'programs_ended_on_range_check'
  ) then
    alter table programs
      add constraint programs_ended_on_range_check
      check (ended_on is null or ended_on >= started_on - 1);
  end if;
end$$;

-- ============================================================
-- RPCs: rebuild_block and rollover_block
-- ============================================================

-- Helper: compute cycle week for a given date in a block
create or replace function cycle_week_for(
  p_week_offset int,
  p_started_on date,
  p_date date
) returns int
language sql immutable
as $$
  select p_week_offset + floor((p_date - p_started_on) / 7) + 1;
$$;

-- rebuild_block: Retire active block as 'superseded', insert new block
-- SECURITY INVOKER: RLS applies, uses auth.uid()
create or replace function rebuild_block(
  p_today date,
  p_payload jsonb
) returns uuid
language plpgsql
security invoker
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

  -- Serialize concurrent calls per user with advisory lock
  perform pg_advisory_xact_lock(hashtext('rebuild:' || v_user_id::text));

  -- Re-read the active block after acquiring lock
  select id, started_on, week_offset
  into v_old_block
  from programs
  where user_id = v_user_id and status = 'active';

  if not found then
    raise exception 'No active block to rebuild';
  end if;

  -- IDEMPOTENT: if an active block already started on p_today with the SAME payload id, return it
  -- This handles retries and concurrent calls with the same payload
  if v_old_block.started_on = p_today and v_old_block.id = (p_payload->>'id')::uuid then
    return v_old_block.id;
  end if;
  
  -- If started_on = p_today but DIFFERENT payload id, this is an intentional same-day rebuild
  -- Continue to supersede and create new block

  -- Compute new week_offset: carry over the current cycle week
  v_new_week_offset := (
    v_old_block.week_offset +
    floor((p_today - v_old_block.started_on) / 7)
  );

  -- Retire the old block as 'superseded'
  -- For same-day second rebuild, ended_on = started_on - 1 (empty range)
  update programs
  set
    status = 'superseded',
    ended_on = p_today - 1
  where id = v_old_block.id;

  -- Insert new program
  insert into programs (
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

  -- Insert program_days
  for v_day in select * from jsonb_array_elements(p_payload->'days')
  loop
    insert into program_days (
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
      insert into program_day_exercises (
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
    from programs
    where user_id = v_user_id and status = 'active';
    return v_new_program_id;
end;
$$;

-- rollover_block: Retire active block as 'completed', insert new block
-- SECURITY INVOKER: RLS applies, uses auth.uid()
create or replace function rollover_block(
  p_today date,
  p_payload jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_block record;
  v_new_started_on date;
  v_new_program_id uuid;
  v_program_day_id uuid;
  v_day jsonb;
  v_exercise jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Serialize concurrent calls per user with advisory lock
  perform pg_advisory_xact_lock(hashtext('rollover:' || v_user_id::text));

  -- Re-read the active block after acquiring lock
  select id, started_on, ends_on
  into v_old_block
  from programs
  where user_id = v_user_id and status = 'active';

  if not found then
    raise exception 'No active block to roll over';
  end if;

  -- IDEMPOTENT: if the active block's started_on > p_today - 1, a rollover has already happened
  -- This handles stale calls or concurrent calls that lost the race
  if v_old_block.started_on > v_old_block.ends_on then
    -- Active block started after a previous block ended, so rollover already happened
    return v_old_block.id;
  end if;
  
  -- Check if current block hasn't ended yet (p_today <= ends_on)
  if p_today <= v_old_block.ends_on then
    -- Block is still active, no rollover needed
    return v_old_block.id;
  end if;

  -- New block starts the day after the old one ends
  v_new_started_on := v_old_block.ends_on + 1;

  -- Retire the old block as 'completed'
  update programs
  set
    status = 'completed',
    ended_on = v_old_block.ends_on
  where id = v_old_block.id;

  -- Insert new program (week_offset stays 0 for rollover)
  insert into programs (
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
    (p_payload->>'ends_on')::date,
    (p_payload->>'deload_week')::int,
    0,
    'active'
  ) returning id into v_new_program_id;

  -- Insert program_days
  for v_day in select * from jsonb_array_elements(p_payload->'days')
  loop
    insert into program_days (
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
      insert into program_day_exercises (
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

comment on function rebuild_block is 'Rebuild the active block: retire as superseded, insert new block with carried-over week_offset. Idempotent.';
comment on function rollover_block is 'Roll over to a new block: retire as completed, insert new block starting after the old one ends. Idempotent.';
