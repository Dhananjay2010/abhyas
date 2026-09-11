-- Breathe, phase 1 (BREATHE-SPEC.md section 6).
--
-- Additive only. Every existing column stays and keeps its meaning, so the app
-- on `main` keeps working against this schema until the branch is merged.

-- ============================================================
-- 1. PATTERNS CARRY THEIR OWN PHASES
--
-- A pattern used to be four numbers (in, hold, out, hold) plus special cases
-- keyed on its slug inside the component. That is how Nadi Shodhana came to
-- label a whole cycle with one nostril, and how the physiological sigh was
-- paced as a single inhale. Each pattern now lists its phases in order, with
-- the words to show for each one.
--
-- A phase is {"kind": "inhale" | "hold" | "exhale", "seconds": n, "cue": text}
-- with three optional fields:
--   "label" -- the short name on the rhythm chips; In / Hold / Out by default
--   "side"  -- "left" | "right", the open nostril
--   "to"    -- the orb size the phase ends at, 0..1. An inhale ends at 1 and an
--              exhale at 0 unless told otherwise; the sigh's first inhale stops
--              at 0.8 so the sniff has somewhere to go.
--
-- The four legacy timing columns are left as they were. Only the code on
-- `main` still reads them.
-- ============================================================

alter table breathing_patterns
  add column subtitle       text,
  add column phases         jsonb,
  add column intents        text[] not null default '{}',
  add column max_cycles     int,
  add column how_to         text[] not null default '{}',
  add column why            text,
  add column evidence_label text,
  add column evidence_url   text;

update breathing_patterns set
  subtitle = 'Four equal sides',
  phases = '[
    {"kind": "inhale", "seconds": 4, "cue": "Breathe in"},
    {"kind": "hold",   "seconds": 4, "cue": "Hold"},
    {"kind": "exhale", "seconds": 4, "cue": "Breathe out"},
    {"kind": "hold",   "seconds": 4, "cue": "Hold"}
  ]'::jsonb,
  intents = '{focus,calm}',
  how_to = array[
    'Sit upright, feet flat, shoulders soft.',
    'Breathe in through your nose for four.',
    'Hold gently for four. There should be no strain in your throat.',
    'Breathe out for four, then rest empty for four.'
  ],
  why = 'Slow, even counts bring your breathing rate down and give a busy mind one simple job. It is a favourite for staying composed before something demanding.'
where slug = 'box-breathing';

-- Andrew Weil, who popularised it, advises four breaths at a time for the
-- first month and never more than eight. The cap is enforced by the controls,
-- not left to the caution text.
update breathing_patterns set
  subtitle = 'The long exhale, for sleep',
  phases = '[
    {"kind": "inhale", "seconds": 4, "cue": "Breathe in through your nose"},
    {"kind": "hold",   "seconds": 7, "cue": "Hold"},
    {"kind": "exhale", "seconds": 8, "cue": "Out through your mouth, whoosh"}
  ]'::jsonb,
  intents = '{sleep,calm}',
  max_cycles = 8,
  how_to = array[
    'Rest the tip of your tongue on the ridge just behind your upper front teeth, and keep it there.',
    'Breathe in quietly through your nose for four.',
    'Hold for seven.',
    'Breathe out through your mouth for eight, with a soft whoosh.'
  ],
  why = 'The exhale is twice as long as the inhale, and breathing out is the part of each breath that slows your heart. Four rounds is enough to feel it.',
  contraindications = 'Not while pregnant, or with low blood pressure. Start with four breaths. The app stops you at eight.'
where slug = 'four-seven-eight';

update breathing_patterns set
  subtitle = 'About five and a half breaths a minute',
  phases = '[
    {"kind": "inhale", "seconds": 5.5, "cue": "Breathe in"},
    {"kind": "exhale", "seconds": 5.5, "cue": "Breathe out"}
  ]'::jsonb,
  intents = '{calm,balance}',
  how_to = array[
    'Sit or lie down comfortably.',
    'Breathe in through your nose, smoothly, for the whole rise.',
    'Breathe out through your nose just as smoothly, with no pause at the top or bottom.',
    'Keep it gentle. It should feel easy, never like work.'
  ],
  why = 'At around five and a half breaths a minute, your breathing and heart rhythm tend to fall into step, which goes with steadier, calmer heart-rate variability. It is the safest one to do every day.'
where slug = 'coherent-breathing';

update breathing_patterns set
  subtitle = 'Double inhale, long exhale',
  phases = '[
    {"kind": "inhale", "seconds": 2, "cue": "Breathe in through your nose", "to": 0.8},
    {"kind": "inhale", "seconds": 1, "cue": "Sniff to top it up", "label": "Sniff"},
    {"kind": "exhale", "seconds": 6, "cue": "Long breath out through your mouth"}
  ]'::jsonb,
  intents = '{calm,recover}',
  how_to = array[
    'Breathe in through your nose until your lungs feel nearly full.',
    'Take one more short sniff on top to fill them completely.',
    'Let it all go slowly through your mouth, until you are empty.',
    'Repeat. Five minutes a day is the version the research tested.'
  ],
  why = 'The second sniff helps reopen the smallest air sacs in your lungs, and the long exhale slows you down. In a month-long randomised trial, five minutes of this a day improved mood more than mindfulness meditation did.',
  evidence_label = 'Balban et al., Cell Reports Medicine, 2023',
  evidence_url = 'https://pubmed.ncbi.nlm.nih.gov/36630953/'
where slug = 'physiological-sigh';

-- One cycle now covers both sides: in left, out right, in right, out left.
-- default_cycles is left at 10 because only the code on `main` reads it for
-- this pattern; the new code picks its length in minutes.
update breathing_patterns set
  name = 'Nadi Shodhana',
  subtitle = 'Alternate-nostril breathing',
  phases = '[
    {"kind": "inhale", "seconds": 4, "cue": "In through the left",   "side": "left"},
    {"kind": "hold",   "seconds": 4, "cue": "Hold, both sides closed"},
    {"kind": "exhale", "seconds": 8, "cue": "Out through the right", "side": "right"},
    {"kind": "inhale", "seconds": 4, "cue": "In through the right",  "side": "right"},
    {"kind": "hold",   "seconds": 4, "cue": "Hold, both sides closed"},
    {"kind": "exhale", "seconds": 8, "cue": "Out through the left",  "side": "left"}
  ]'::jsonb,
  intents = '{balance,focus}',
  how_to = array[
    'Sit tall and rest your left hand in your lap.',
    'Your right thumb closes the right nostril; your ring finger closes the left.',
    'Follow the screen. It shows which side is open for every breath.',
    'One round is in left, out right, in right, out left.'
  ],
  why = 'The slow count, and the attention that switching sides takes, leave little room for anything else, which is much of why it settles the mind. It is a staple of pranayama.',
  contraindications = 'Skip it if your nose is blocked. Ease off the holds if you feel light-headed.'
where slug = 'nadi-shodhana';

update breathing_patterns set
  name = 'Bhramari',
  subtitle = 'Humming bee breath',
  phases = '[
    {"kind": "inhale", "seconds": 4, "cue": "Breathe in through your nose"},
    {"kind": "exhale", "seconds": 8, "cue": "Hum, mmmm", "label": "Hum"}
  ]'::jsonb,
  intents = '{calm,sleep}',
  how_to = array[
    'Sit comfortably and close your eyes.',
    'If you like, rest your index fingers on the flap of cartilage at the front of each ear.',
    'Breathe in through your nose.',
    'Breathe out slowly while humming, lips closed. Feel the buzz in your face and head.'
  ],
  why = 'Humming stretches the exhale without effort, and the vibration gives your attention something physical to rest on.'
where slug = 'bhramari';

alter table breathing_patterns
  alter column phases set not null,
  add constraint breathing_patterns_phases_shape
    check (jsonb_typeof(phases) = 'array' and jsonb_array_length(phases) between 1 and 24),
  add constraint breathing_patterns_intents_known
    check (intents <@ array['calm', 'sleep', 'focus', 'energy', 'recover', 'balance']),
  add constraint breathing_patterns_max_cycles_sane
    check (max_cycles is null or max_cycles between 1 and 1000);

-- ============================================================
-- 2. WHAT A PRACTICE ACTUALLY WAS
--
-- `sessions` says a practice happened and for how long. This says what it
-- was: the pattern, the breaths, whether it was ended early, and the check-in.
-- A child row rather than more columns on `sessions`, so that a routine in a
-- later phase can log several patterns inside one session.
--
-- pattern_name is a snapshot, so History still reads correctly if a pattern is
-- renamed or removed.
-- ============================================================

create table breathing_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  session_id       uuid not null references sessions(id) on delete cascade,
  pattern_id       uuid references breathing_patterns(id) on delete set null,
  pattern_name     text not null,
  cycles_completed int  not null check (cycles_completed between 1 and 1000),
  planned_cycles   int  not null check (planned_cycles between 1 and 1000),
  breaths          int  not null check (breaths between 1 and 2000),
  seconds          int  not null check (seconds between 1 and 7200),
  ended_early      boolean not null default false,
  mood_before      smallint check (mood_before between 1 and 5),
  mood_after       smallint check (mood_after between 1 and 5),
  guidance         text not null default 'off' check (guidance in ('tones', 'off')),
  created_at       timestamptz not null default now()
);

create index breathing_logs_user_created_idx on breathing_logs (user_id, created_at desc);
create index breathing_logs_session_idx on breathing_logs (session_id);

-- Same rule as every other child table: the owner is read from the parent,
-- never trusted from the client, and the insert policy then rejects the row
-- unless that owner is the caller.
create trigger breathing_logs_set_user_id
  before insert or update on public.breathing_logs
  for each row execute function public.set_user_id_from_parent('sessions', 'session_id');

alter table breathing_logs enable row level security;

create policy breathing_logs_owner_select on public.breathing_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy breathing_logs_owner_insert on public.breathing_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy breathing_logs_owner_update on public.breathing_logs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy breathing_logs_owner_delete on public.breathing_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.breathing_logs to authenticated;

-- ============================================================
-- 3. BREATHING PREFERENCES
--
-- Columns on user_settings rather than a table of their own: every user
-- already has exactly one settings row, created at sign-up, and five fields
-- do not justify a second one. meditation_default_minutes keeps its job as
-- the default length; it now has an honest range instead of none.
-- ============================================================

alter table user_settings
  add column breathing_guidance   text    not null default 'tones'
    check (breathing_guidance in ('tones', 'off')),
  add column breathing_show_count boolean not null default true,
  add column breathing_vibrate    boolean not null default true,
  add column breathing_settle_in  boolean not null default true,
  add column breathing_check_in   text    not null default 'after'
    check (breathing_check_in in ('off', 'after', 'both')),
  add constraint user_settings_meditation_minutes_sane
    check (meditation_default_minutes between 1 and 60);

-- ============================================================
-- 4. RECORDING A PRACTICE
--
-- One function, so the session row and its log are written together or not
-- at all. SECURITY INVOKER: it runs as the caller, so every statement inside
-- is held to the same row-level security as a direct query.
--
-- The bug this replaces: the old action reused ANY unfinished session for
-- today. Finishing two minutes of breathing in the middle of a workout
-- rewrote that workout as a completed "Breathing" session. Yoga was fixed for
-- the same reason (src/app/yoga/actions.ts); breathing never was. Now only a
-- planned breathing slot is reused, and anything else is left alone.
--
-- p_log_id is chosen by the client, which makes a retry safe: if the first
-- attempt landed and only its response was lost, the second finds the log
-- and returns without writing anything.
-- ============================================================

create or replace function public.record_breathing_practice(
  p_log_id         uuid,
  p_local_date     date,
  p_pattern_id     uuid,
  p_cycles         int,
  p_planned_cycles int,
  p_breaths        int,
  p_seconds        int,
  p_ended_early    boolean,
  p_mood_before    smallint,
  p_guidance       text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_user    uuid := auth.uid();
  v_name    text;
  v_session uuid;
begin
  if v_user is null then
    raise exception 'record_breathing_practice: not signed in';
  end if;

  select session_id into v_session from breathing_logs where id = p_log_id;
  if v_session is not null then
    return v_session;
  end if;

  select name into v_name from breathing_patterns where id = p_pattern_id;
  if v_name is null then
    raise exception 'record_breathing_practice: unknown pattern %', p_pattern_id;
  end if;

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

  insert into breathing_logs (
    id, user_id, session_id, pattern_id, pattern_name,
    cycles_completed, planned_cycles, breaths, seconds,
    ended_early, mood_before, guidance
  ) values (
    p_log_id, v_user, v_session, p_pattern_id, v_name,
    p_cycles, p_planned_cycles, p_breaths, p_seconds,
    p_ended_early, p_mood_before, p_guidance
  );

  return v_session;
end;
$fn$;

revoke all on function public.record_breathing_practice(
  uuid, date, uuid, int, int, int, int, boolean, smallint, text
) from public, anon;
grant execute on function public.record_breathing_practice(
  uuid, date, uuid, int, int, int, int, boolean, smallint, text
) to authenticated;

notify pgrst, 'reload schema';
