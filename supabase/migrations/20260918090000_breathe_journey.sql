-- Breathe, phase 3d: Breath foundations, a seven-day course.
--
-- One practice a day with a sentence about what it teaches. Day one is the
-- physiological sigh; day seven is whichever practice your own check-ins rate
-- best. BREATHE-SPEC.md section 16.4.
--
-- Entirely additive. Nothing existing is altered: a journey day runs the
-- ordinary practice player and saves through the ordinary
-- record_breathing_practice. Only the progress row is new, and it is written
-- by its own function so the two rules that make this a course rather than a
-- list -- days in order, one a day -- live in one place.

-- ============================================================
-- 1. THE COURSE
--
-- A day names a practice by slug and says how long it is, in the same two
-- units a routine step uses:
--
--   {"slug": "coherent-breathing", "minutes": 3, "title": …, "teaches": …}
--   {"slug": "physiological-sigh", "cycles": 5,  "title": …, "teaches": …}
--
-- A day may instead say `"pick": "best"`, which the app resolves at load
-- against your own check-ins. `slug` is then the fallback, used until you have
-- rated enough practices for "best" to mean anything.
-- ============================================================

create table breathing_journeys (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  subtitle    text,
  description text not null,
  about       text,
  days        jsonb not null
    check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) between 3 and 14),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table breathing_journeys enable row level security;

-- The same rule as the pattern catalogue and the routines: everyone signed in
-- may read it, nobody may write it from the client.
create policy breathing_journeys_read on public.breathing_journeys
  for select to authenticated using (true);

grant select on public.breathing_journeys to authenticated;

insert into breathing_journeys (slug, name, subtitle, description, about, days, sort_order) values

  ('foundations', 'Breath foundations', 'Seven days',
   'One practice a day for a week, each teaching one thing. By the end you will know which of them works on you.',
   'The order is deliberate. The first three days are the mechanism — what a long exhale actually does. Day four adds the holds, day five gives your attention somewhere to go, day six adds sound. Day seven is not ours to choose: by then you have rated six practices, and the one your own check-ins rate highest is the one you should keep.',
   '[
     {"slug": "physiological-sigh", "cycles": 6,
      "title": "The fastest way down",
      "teaches": "Two breaths in, one long breath out. It is the quickest way to take the edge off, and it works in under a minute."},

     {"slug": "coherent-breathing", "minutes": 3,
      "title": "A rhythm you can hold",
      "teaches": "In and out, evenly, about six breaths a minute. Nothing to count and nothing to hold — this is the baseline everything else is measured against."},

     {"slug": "extended-exhale", "minutes": 3,
      "title": "The exhale is the brake",
      "teaches": "The same breath as yesterday with a longer exhale. Breathing out is the half that slows your heart, which is why almost every calming practice lengthens it."},

     {"slug": "box-breathing", "minutes": 3,
      "title": "Holding still is part of it",
      "teaches": "Four equal sides, including two where nothing moves. The holds are what make this steadying rather than sedating."},

     {"slug": "anulom-vilom", "minutes": 4,
      "title": "Attention needs somewhere to go",
      "teaches": "Your hand closes one nostril, then the other. The point is not the nostrils — it is that a wandering mind now has a job."},

     {"slug": "bhramari", "minutes": 4,
      "title": "A breath you can feel",
      "teaches": "The hum turns the exhale into something physical in your skull. It is the one people are shyest about and rate highest afterwards."},

     {"pick": "best", "slug": "coherent-breathing", "minutes": 5,
      "title": "The one that works on you",
      "teaches": "Six practices, six check-ins. This is whichever of them left you calmest — your evidence, not ours. Keep it."}
   ]'::jsonb,
   1)

on conflict (slug) do nothing;

-- ============================================================
-- 2. WHERE SOMEONE IS UP TO
--
-- One row per person per journey. days_completed is the count finished, so
-- the next day is always days_completed + 1 and the course is over when it
-- equals the number of days.
--
-- last_day_on is what makes this a seven-*day* course: a day may only be
-- counted on a later calendar date than the one before it.
-- ============================================================

create table user_journey_progress (
  user_id        uuid not null references auth.users(id) on delete cascade,
  journey_id     uuid not null references breathing_journeys(id) on delete cascade,
  days_completed smallint not null default 0 check (days_completed between 0 and 14),
  started_on     date not null,
  -- The local date the most recent day was counted on.
  last_day_on    date,
  completed_at   timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (user_id, journey_id)
);

alter table user_journey_progress enable row level security;

-- Readable by its owner, and writable only through advance_journey_day below.
-- No insert, update or delete policy exists, so the two course rules cannot be
-- walked around from the client.
create policy user_journey_progress_owner_select on public.user_journey_progress
  for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.user_journey_progress to authenticated;

create trigger user_journey_progress_updated_at
  before update on public.user_journey_progress
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. COUNTING A DAY
--
-- security definer, unlike record_breathing_practice, because this table has
-- no write policy at all: the rules ARE the write path, and leaving them to
-- the caller would make them decoration. Everything it touches is scoped to
-- auth.uid(), and it is granted only to authenticated.
--
-- Refusing is not an error. Repeating a day you have already done is an
-- ordinary thing to do -- "Again" on the ending screen does exactly that --
-- and it should leave your progress alone rather than fail in front of you.
-- So the function always returns where you are and whether it moved.
-- ============================================================

create or replace function public.advance_journey_day(
  p_journey_id uuid,
  p_day        smallint,
  p_local_date date,
  p_log_id     uuid
) returns table (days_completed smallint, day_count smallint, advanced boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user  uuid := auth.uid();
  v_days  smallint;
  v_done  smallint;
  v_last  date;
begin
  if v_user is null then
    raise exception 'advance_journey_day: not signed in';
  end if;

  select jsonb_array_length(days) into v_days from breathing_journeys where id = p_journey_id;
  if v_days is null then
    raise exception 'advance_journey_day: unknown journey %', p_journey_id;
  end if;

  -- A day counts against a practice that actually happened and is yours. The
  -- caller passes the log it has just written; a made-up id counts nothing.
  if not exists (select 1 from breathing_logs where id = p_log_id and user_id = v_user) then
    raise exception 'advance_journey_day: unknown practice %', p_log_id;
  end if;

  insert into user_journey_progress (user_id, journey_id, days_completed, started_on)
  values (v_user, p_journey_id, 0, p_local_date)
  on conflict (user_id, journey_id) do nothing;

  select ujp.days_completed, ujp.last_day_on into v_done, v_last
    from user_journey_progress ujp
   where ujp.user_id = v_user and ujp.journey_id = p_journey_id
   for update;

  -- In order, and one a day. Either refusal leaves the row exactly as it was.
  if p_day <> v_done + 1 or v_done >= v_days or (v_last is not null and v_last >= p_local_date) then
    return query select v_done, v_days, false;
    return;
  end if;

  update user_journey_progress ujp set
    days_completed = p_day,
    last_day_on    = p_local_date,
    completed_at   = case when p_day = v_days then now() else ujp.completed_at end
  where ujp.user_id = v_user and ujp.journey_id = p_journey_id;

  return query select p_day, v_days, true;
end;
$fn$;

revoke all on function public.advance_journey_day(uuid, smallint, date, uuid) from public, anon;
grant execute on function public.advance_journey_day(uuid, smallint, date, uuid) to authenticated;

notify pgrst, 'reload schema';
