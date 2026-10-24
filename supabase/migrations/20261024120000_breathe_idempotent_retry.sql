-- Make record_breathing_practice retry-safe against race conditions.
--
-- Two rapid calls with the same log_id (double tap, two tabs, offline retry)
-- could both pass the "does this log exist?" check before either inserts,
-- causing both to insert and double-count the session. ON CONFLICT on the
-- log's primary key makes the insert idempotent without requiring a new
-- unique constraint: the second call's insert is a no-op, and the early
-- return logic already handles the rest.

drop function if exists public.record_breathing_practice(
  uuid, date, uuid, uuid, int, int, int, int, boolean, smallint, text, uuid, uuid, smallint
);

create or replace function public.record_breathing_practice(
  p_log_id          uuid,
  p_local_date      date,
  p_pattern_id      uuid,
  p_user_pattern_id uuid,
  p_cycles          int,
  p_planned_cycles  int,
  p_breaths         int,
  p_seconds         int,
  p_ended_early     boolean,
  p_mood_before     smallint,
  p_guidance        text,
  p_session_id      uuid   default null,
  p_routine_id      uuid   default null,
  p_routine_step    smallint default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_user    uuid := auth.uid();
  v_name    text;
  v_routine text;
  v_session uuid;
begin
  if v_user is null then
    raise exception 'record_breathing_practice: not signed in';
  end if;

  -- Early return if this exact practice was already logged. A retry, a double
  -- tap on Done, or a second tab all send the same client-generated log_id, so
  -- the session is already complete and its duration already counted.
  select session_id into v_session from breathing_logs where id = p_log_id;
  if v_session is not null then
    return v_session;
  end if;

  if p_user_pattern_id is not null then
    -- RLS already hides other people's rows; this turns an invisible row into
    -- a clear error rather than a log with no name.
    select name into v_name from user_breathing_patterns
     where id = p_user_pattern_id and user_id = v_user;
    if v_name is null then
      raise exception 'record_breathing_practice: unknown practice %', p_user_pattern_id;
    end if;
  else
    select name into v_name from breathing_patterns where id = p_pattern_id;
    if v_name is null then
      raise exception 'record_breathing_practice: unknown pattern %', p_pattern_id;
    end if;
  end if;

  if p_routine_id is not null then
    select name into v_routine from breathing_routines where id = p_routine_id;
    if v_routine is null then
      raise exception 'record_breathing_practice: unknown routine %', p_routine_id;
    end if;
  end if;

  if p_session_id is not null then
    -- A later step of a routine. It must be a session of yours, and one this
    -- function opened -- never an arbitrary row.
    select id into v_session
      from sessions
     where id = p_session_id
       and user_id = v_user
       and local_date = p_local_date
       and actual_type = 'meditation'
     for update;
    if v_session is null then
      raise exception 'record_breathing_practice: unknown session %', p_session_id;
    end if;

    update sessions set
      duration_seconds = coalesce(duration_seconds, 0) + p_seconds,
      completed_at     = now()
    where id = v_session;
  else
    select id into v_session
      from sessions
     where user_id = v_user
       and local_date = p_local_date
       and planned_type = 'meditation'
       and status <> 'completed'
     order by created_at
     limit 1
     for update;

    if v_session is not null then
      update sessions set
        status               = 'completed',
        actual_type          = 'meditation',
        started_at           = coalesce(started_at, now() - make_interval(secs => p_seconds)),
        completed_at         = now(),
        duration_seconds     = p_seconds,
        breathing_pattern_id = p_pattern_id
      where id = v_session;
    else
      insert into sessions (
        user_id, local_date, planned_type, actual_type, status,
        started_at, completed_at, duration_seconds, breathing_pattern_id
      ) values (
        v_user, p_local_date, 'meditation', 'meditation', 'completed',
        now() - make_interval(secs => p_seconds), now(), p_seconds, p_pattern_id
      )
      returning id into v_session;
    end if;
  end if;

  -- Race-safe insert: if two calls reach here with the same log_id (both passed
  -- the early-return check because neither had inserted yet), the second one's
  -- insert is ignored. The function then re-checks at the top of the next call
  -- and returns early, so retries are always safe.
  insert into breathing_logs (
    id, user_id, session_id, pattern_id, user_pattern_id, pattern_name,
    routine_id, routine_name, routine_step,
    cycles_completed, planned_cycles, breaths, seconds,
    ended_early, mood_before, guidance
  ) values (
    p_log_id, v_user, v_session, p_pattern_id, p_user_pattern_id, v_name,
    p_routine_id, v_routine, p_routine_step,
    p_cycles, p_planned_cycles, p_breaths, p_seconds,
    p_ended_early, p_mood_before, p_guidance
  )
  on conflict (id) do nothing;

  return v_session;
end;
$fn$;

revoke all on function public.record_breathing_practice(
  uuid, date, uuid, uuid, int, int, int, int, boolean, smallint, text, uuid, uuid, smallint
) from public, anon;
grant execute on function public.record_breathing_practice(
  uuid, date, uuid, uuid, int, int, int, int, boolean, smallint, text, uuid, uuid, smallint
) to authenticated;

notify pgrst, 'reload schema';
