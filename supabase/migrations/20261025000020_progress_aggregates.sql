-- Progress aggregates: server-side computation to avoid URI too long errors.
--
-- The Progress page was passing up to 500 session IDs in .in() filters (~8.4KB URL),
-- causing PostgREST to return 414 URI too long. This migration adds an RPC function
-- that computes days trained, streak data, and all-time volume server-side.
--
-- Idempotent: uses CREATE OR REPLACE and IF NOT EXISTS.

-- Progress summary RPC: returns days trained, distinct local_dates for streak calculation,
-- total all-time volume, and session count for a user.
--
-- This replaces the client-side pattern of fetching 500 session IDs and then calling
-- session_volume.in(ids), which caused 414 errors for users with >220 sessions.
--
-- Returns: json object with days_trained (count of qualifying sessions), 
-- local_dates (array of distinct dates with qualifying sessions, for streak computation),
-- total_volume_kg (sum of all-time volume), and session_count (total qualifying sessions).
--
-- Security: Uses security invoker so it runs with the caller's RLS context.
-- The caller must have auth.uid() set (authenticated user).
create or replace function progress_summary(
  p_user uuid default auth.uid()
)
returns json
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_result json;
begin
  -- Ensure user is authenticated
  if p_user is null then
    raise exception 'User not authenticated';
  end if;

  -- Compute aggregates directly from session_volume view
  -- session_volume already excludes zero-set strength sessions (from migration 20261025000006)
  -- and only includes completed sessions
  select json_build_object(
    'days_trained', count(distinct sv.local_date),
    'local_dates', array_agg(distinct sv.local_date order by sv.local_date),
    'total_volume_kg', coalesce(sum(sv.volume_kg), 0)::numeric(12,2),
    'session_count', count(sv.session_id)
  )
  into v_result
  from session_volume sv
  where sv.user_id = p_user;

  return v_result;
end;
$$;

comment on function progress_summary is
  'Returns progress aggregates (days trained, local_dates, total volume, session count) '
  'for a user without requiring client to pass unbounded session ID lists. '
  'Used by Progress page to avoid 414 URI too long errors.';

grant execute on function progress_summary(uuid) to authenticated;


-- Get working set counts for a batch of sessions (used by streak computation).
-- This is a focused helper that returns ONLY session_id and set_count, avoiding
-- the need to pass large session ID lists in .in() filters.
--
-- Returns: table with session_id and set_count for each session.
--
-- Security: Uses security invoker so it runs with the caller's RLS context.
create or replace function get_session_set_counts(
  p_user uuid default auth.uid(),
  p_session_ids uuid[] default '{}'
)
returns table(session_id uuid, set_count bigint)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Ensure user is authenticated
  if p_user is null then
    raise exception 'User not authenticated';
  end if;

  -- If no session IDs provided, return empty result
  if array_length(p_session_ids, 1) is null then
    return;
  end if;

  -- Return set counts from session_volume view
  -- session_volume already filters to user_id via RLS context
  return query
  select sv.session_id, sv.set_count
  from session_volume sv
  where sv.user_id = p_user
    and sv.session_id = any(p_session_ids);
end;
$$;

comment on function get_session_set_counts is
  'Returns working set counts for a batch of sessions. '
  'Used by streak computation to filter strength sessions with 0 sets. '
  'Accepts up to 500 session IDs to avoid URI too long errors.';

grant execute on function get_session_set_counts(uuid, uuid[]) to authenticated;


-- Fix actual_type filter: use coalesce(s.actual_type, '') instead of IN checks
-- to ensure NULL actual_type sessions aren't silently dropped.
--
-- This recreates session_volume and exercise_strength_history to handle NULL actual_type correctly.

drop view if exists session_volume;

create view session_volume with (security_invoker = on) as
select
  s.id            as session_id,
  s.user_id,
  s.local_date,
  s.duration_seconds,
  s.is_deload,
  s.actual_type,
  coalesce(sum(ss.reps * ss.weight_kg), 0)::numeric(10,2) as volume_kg,
  count(ss.id)                                            as set_count
from sessions s
left join session_exercises se on se.session_id = s.id
left join session_sets ss
       on ss.session_exercise_id = se.id
      and ss.is_warmup_set = false
      and (ss.reps is not null or ss.duration_seconds is not null)
where s.status = 'completed'
group by s.id, s.user_id, s.local_date, s.duration_seconds, s.is_deload, s.actual_type
-- Exclude strength sessions with 0 working sets
having count(case when ss.is_warmup_set = false
                    and (ss.reps is not null and ss.reps > 0
                         or ss.duration_seconds is not null and ss.duration_seconds > 0)
                  then 1 end) > 0
    -- Include non-strength sessions (coalesce handles NULL)
    or coalesce(s.actual_type, '') not in ('weights', 'bodyweight');

grant select on session_volume to authenticated;


drop view if exists exercise_strength_history;

create view exercise_strength_history with (security_invoker = on) as
select
  ss.user_id,
  se.exercise_id,
  e.name                                                     as exercise_name,
  e.movement_pattern,
  s.local_date,
  max(ss.weight_kg)::numeric(6,2)                            as top_weight_kg,
  max(ss.weight_kg * (1 + least(ss.reps, 12) / 30.0))::numeric(6,2) as best_e1rm
from session_sets ss
join session_exercises se on se.id = ss.session_exercise_id
join sessions s           on s.id = se.session_id
join exercises e          on e.id = se.exercise_id
where ss.is_warmup_set = false
  and ss.reps is not null and ss.reps > 0
  and ss.weight_kg is not null and ss.weight_kg > 0
  and s.status = 'completed'
  -- Exclude sessions with only warmups
  and exists (
    select 1
    from session_sets ss2
    join session_exercises se2 on se2.id = ss2.session_exercise_id
    where se2.session_id = s.id
      and ss2.is_warmup_set = false
      and (ss2.reps is not null and ss2.reps > 0
           or ss2.duration_seconds is not null and ss2.duration_seconds > 0)
  )
  -- Include all strength sessions (coalesce handles NULL)
  and coalesce(s.actual_type, '') in ('weights', 'bodyweight', '')
group by ss.user_id, se.exercise_id, e.name, e.movement_pattern, s.local_date;

grant select on exercise_strength_history to authenticated;


-- Get filtered session count for History page.
-- This excludes zero-set strength sessions and skipped sessions, matching what
-- will actually be displayed in the History list.
--
-- Returns: count of sessions that pass the filter
-- Security: Uses security invoker so it runs with the caller's RLS context.
create or replace function get_history_count(
  p_user uuid default auth.uid(),
  p_filter text default 'lifts',
  p_today text default null
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count bigint;
  v_today text;
begin
  -- Ensure user is authenticated
  if p_user is null then
    raise exception 'User not authenticated';
  end if;

  -- Default to current date if not provided
  v_today := coalesce(p_today, current_date::text);

  -- Count sessions based on filter, excluding zero-set strength and skipped
  if p_filter = 'lifts' then
    -- For strength sessions, only count those with working sets (in session_volume)
    select count(distinct s.id)
    into v_count
    from sessions s
    inner join session_volume sv on sv.session_id = s.id
    where s.user_id = p_user
      and s.local_date <= v_today
      and s.status <> 'skipped'
      and coalesce(s.actual_type, '') in ('weights', 'bodyweight', '');
  elsif p_filter = 'yoga' then
    select count(*)
    into v_count
    from sessions s
    where s.user_id = p_user
      and s.local_date <= v_today
      and s.status <> 'skipped'
      and s.actual_type = 'yoga';
  elsif p_filter = 'breathing' then
    select count(*)
    into v_count
    from sessions s
    where s.user_id = p_user
      and s.local_date <= v_today
      and s.status <> 'skipped'
      and s.actual_type = 'meditation';
  else
    v_count := 0;
  end if;

  return v_count;
end;
$$;

comment on function get_history_count is
  'Returns count of sessions for History page, excluding zero-set strength and skipped sessions. '
  'Matches the count of rows that will actually be displayed.';

grant execute on function get_history_count(uuid, text, text) to authenticated;
