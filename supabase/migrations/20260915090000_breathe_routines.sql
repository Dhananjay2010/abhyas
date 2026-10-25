-- Breathe, phase 3a: routines.
--
-- A routine is two to four practices run back to back inside one session.
-- BREATHE-SPEC.md section 16.1.
--
-- Additive except for record_breathing_practice, which is replaced so a later
-- step can append to the session the first step opened. Phase 1 anticipated
-- this: breathing_logs was made a child of sessions precisely "so that a
-- routine in a later phase can log several patterns inside one session".

-- ============================================================
-- 1. THE ROUTINES
--
-- Steps name a practice by slug and say how long that step is, in the same two
-- units the setup screen offers:
--
--   {"slug": "coherent-breathing", "minutes": 2}   paced in minutes
--   {"slug": "physiological-sigh", "cycles": 5}    counted in breaths
--
-- Length is stored as the intent rather than as a cycle count so that a
-- practice you have retimed still runs for about as long as the routine says.
-- The app resolves it against your own timings at load.
-- ============================================================

create table breathing_routines (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  subtitle    text,
  description text not null,
  about       text,
  steps       jsonb not null
    check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 2 and 6),
  intents     text[] not null default '{}'
    check (intents <@ array['calm', 'sleep', 'focus', 'energy', 'recover', 'balance']),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table breathing_routines enable row level security;

-- The same rule as the pattern catalogue: everyone signed in may read it,
-- nobody may write it from the client.
create policy breathing_routines_read on public.breathing_routines
  for select to authenticated using (true);

grant select on public.breathing_routines to authenticated;

insert into breathing_routines (slug, name, subtitle, description, about, steps, intents, sort_order) values

  ('downshift', 'Downshift', 'After training',
   'Drop the heart rate first, then settle into something you could keep doing.',
   'Hard effort leaves the sympathetic side of your nervous system switched on. The sigh is the fastest way to interrupt that, and the two longer practices give the change somewhere to land.',
   '[
     {"slug": "physiological-sigh", "cycles": 5},
     {"slug": "extended-exhale",    "minutes": 2},
     {"slug": "coherent-breathing", "minutes": 2}
   ]'::jsonb,
   '{recover,calm}', 1),

  ('wind-down', 'Wind Down', 'For sleep',
   'Long exhales, then the count that stops you thinking, then the hum.',
   'Each step is quieter than the one before it. By the hum there is nothing to count and nothing to hold, which is the point: the practice should end somewhere close to sleep.',
   '[
     {"slug": "extended-exhale",  "minutes": 3},
     {"slug": "four-seven-eight", "cycles": 4},
     {"slug": "bhramari",         "minutes": 2}
   ]'::jsonb,
   '{sleep,calm}', 2),

  ('morning', 'Morning', 'Balance, then a steady edge',
   'Alternate nostrils to even things out, then four equal sides to sharpen up.',
   'Anulom Vilom first because it asks nothing of you but attention. Box breathing second because the equal sides are steadying rather than sedating, which is what a morning wants.',
   '[
     {"slug": "anulom-vilom",  "minutes": 2},
     {"slug": "box-breathing", "minutes": 3}
   ]'::jsonb,
   '{balance,focus}', 3),

  ('reset', 'Reset', 'Three minutes, mid-day',
   'Three sighs to break the state you are in, then coherent breathing to hold the new one.',
   'The short one. It fits in the gap between two things, which is usually when it is needed.',
   '[
     {"slug": "physiological-sigh", "cycles": 3},
     {"slug": "coherent-breathing", "minutes": 2.5}
   ]'::jsonb,
   '{calm,focus}', 4)

on conflict (slug) do nothing;

-- ============================================================
-- 2. A LOG KNOWS WHICH ROUTINE IT WAS PART OF
--
-- Nullable, so every practice logged so far and every single practice from now
-- on is unchanged. routine_step is 1-based and orders the steps in History.
-- ============================================================

alter table breathing_logs
  add column routine_id   uuid references breathing_routines(id) on delete set null,
  add column routine_name text,
  add column routine_step smallint check (routine_step between 1 and 6);

-- ============================================================
-- 3. RECORDING A STEP INTO AN OPEN SESSION
--
-- Replaces the phase 2b function. Everything it guaranteed still holds: one
-- transaction, only a planned breathing slot is ever reused, a retry with the
-- same log id writes nothing, and a practice that is not yours is refused.
--
-- New: p_session_id. The first step of a routine passes null and gets a
-- session back exactly as a single practice does. Later steps pass that
-- session and their log is added to it, with their seconds added to its
-- duration. The early return on an existing log id is what keeps a retry from
-- counting those seconds twice.
-- ============================================================

drop function if exists public.record_breathing_practice(
  uuid, date, uuid, uuid, int, int, int, int, boolean, smallint, text
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
  );

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
