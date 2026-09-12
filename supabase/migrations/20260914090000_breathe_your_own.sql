-- Breathe, phase 2b: four more practices, your own timings, and your own
-- practices.
--
-- Additive except for one function, which is replaced: the old
-- record_breathing_practice knew only about the built-in patterns.

-- ============================================================
-- 1. FOUR MORE PRACTICES
--
-- Chosen to fill the gaps the six left: the gentlest calming pattern, the
-- pranayama two that Indian practice expects, and one for cooling down after
-- training.
-- ============================================================

insert into breathing_patterns
  (slug, name, subtitle, description, inhale_seconds, hold_in_seconds, exhale_seconds, hold_out_seconds,
   default_cycles, benefit, contraindications, level, sort_order, intents, phases, how_to, why) values

  ('extended-exhale', 'Extended Exhale', 'Out for longer than in',
   'Breathe in for four, out for six. No holds, nothing to strain against.',
   4, 0, 6, 0, 30, 'The gentlest way down. Safe for anyone, any time.',
   null, 'beginner', 7, '{calm,sleep}',
   '[
     {"kind": "inhale", "seconds": 4, "cue": "Breathe in"},
     {"kind": "exhale", "seconds": 6, "cue": "Breathe out slowly"}
   ]'::jsonb,
   array[
     'Sit or lie down, whichever is more comfortable.',
     'Breathe in through your nose for four.',
     'Breathe out through your nose for six, smooth and unhurried.',
     'If six feels long, breathe more shallowly rather than faster.'
   ],
   'Breathing out is the half of the breath that slows your heart, so making the exhale longer than the inhale is the simplest way there is to settle. Nothing is held, so there is nothing to brace against.'),

  ('ujjayi', 'Ujjayi', 'Ocean breath',
   'Breathe through the nose with the throat slightly narrowed, so each breath has a soft sound to follow.',
   5, 0, 5, 0, 27, 'Steadies you without counting. The sound does the work.',
   'Stop if your throat feels sore or you become light-headed.', 'beginner', 8, '{calm,focus}',
   '[
     {"kind": "inhale", "seconds": 5, "cue": "In through the nose, softly"},
     {"kind": "exhale", "seconds": 5, "cue": "Out with a whisper in the throat"}
   ]'::jsonb,
   array[
     'Mouth closed, breathing through your nose throughout.',
     'Narrow the back of your throat a little, as though fogging a mirror with your mouth shut.',
     'You should hear a soft hiss, like surf heard from a distance. It is a whisper, not a strain.',
     'Keep both halves of the breath the same length.'
   ],
   'The narrowed throat slows the air, which lengthens every breath without you having to count. The sound gives your attention something steady to rest on.'),

  ('anulom-vilom', 'Anulom Vilom', 'Alternate nostrils, no holds',
   'The alternation of Nadi Shodhana without the breath holds. A gentler place to start.',
   4, 0, 4, 0, 10, 'Balance and a quiet mind, with nothing held.',
   'Skip it if your nose is blocked.', 'beginner', 9, '{balance,calm}',
   '[
     {"kind": "inhale", "seconds": 4, "cue": "In through the left",  "side": "left"},
     {"kind": "exhale", "seconds": 4, "cue": "Out through the right", "side": "right"},
     {"kind": "inhale", "seconds": 4, "cue": "In through the right", "side": "right"},
     {"kind": "exhale", "seconds": 4, "cue": "Out through the left",  "side": "left"}
   ]'::jsonb,
   array[
     'Sit tall, left hand resting in your lap.',
     'Right thumb closes the right nostril; your ring finger closes the left.',
     'Follow the screen: it shows which side is open for each breath.',
     'One round is in left, out right, in right, out left.'
   ],
   'The same alternation as Nadi Shodhana, without holding the breath, so it suits anyone the holds do not. Switching sides takes just enough attention to keep the mind from wandering.'),

  ('sheetali', 'Sheetali', 'The cooling breath',
   'Draw the air in across a rolled tongue, then breathe out through the nose.',
   4, 0, 6, 0, 20, 'Cooling. Good after training, or in the heat.',
   'Not when you are already cold or your nose is blocked, and not if cold air sets off your asthma.',
   'beginner', 10, '{recover,calm}',
   '[
     {"kind": "inhale", "seconds": 4, "cue": "In through a rolled tongue"},
     {"kind": "exhale", "seconds": 6, "cue": "Out through your nose"}
   ]'::jsonb,
   array[
     'Roll your tongue into a tube and let the tip sit just past your lips.',
     'If your tongue will not roll, part your teeth and draw the air through them instead. That version is Sheetkari.',
     'Draw the air in through the tube. It should feel cool.',
     'Close your mouth and breathe out through your nose.'
   ],
   'Air drawn across a wet tongue cools as the moisture evaporates, which is why this one is taught for heat and for cooling down after effort.')

on conflict (slug) do nothing;

-- ============================================================
-- 2. YOUR OWN TIMINGS, AND YOUR OWN PRACTICES
--
-- One table for both, because they are the same thing: a list of phases that
-- belongs to you.
--   base_pattern_id set  -- your timing for a built-in practice
--   base_pattern_id null -- a practice you made yourself
--
-- SPEC.md section 9.4 asked for per-pattern timings from the start.
-- ============================================================

create table user_breathing_patterns (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  base_pattern_id uuid references breathing_patterns(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 60),
  phases          jsonb not null
    check (jsonb_typeof(phases) = 'array' and jsonb_array_length(phases) between 1 and 24),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One set of timings per practice per person; a second edit updates the first.
create unique index user_breathing_patterns_one_per_base
  on user_breathing_patterns (user_id, base_pattern_id)
  where base_pattern_id is not null;
create index user_breathing_patterns_user_idx
  on user_breathing_patterns (user_id, created_at desc);

create trigger user_breathing_patterns_updated_at
  before update on public.user_breathing_patterns
  for each row execute function public.set_updated_at();

alter table user_breathing_patterns enable row level security;

create policy user_breathing_patterns_owner_select on public.user_breathing_patterns
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_breathing_patterns_owner_insert on public.user_breathing_patterns
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_breathing_patterns_owner_update on public.user_breathing_patterns
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_breathing_patterns_owner_delete on public.user_breathing_patterns
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_breathing_patterns to authenticated;

-- A practice can now belong to one of your own. The log already snapshots the
-- name, so history survives even if the practice is later deleted.
alter table breathing_logs
  add column user_pattern_id uuid references user_breathing_patterns(id) on delete set null;

-- ============================================================
-- 3. RECORDING A PRACTICE, NOW THAT IT MIGHT BE YOURS
--
-- Replaces the phase 1 function. Same guarantees: one transaction, only a
-- planned breathing slot is ever reused, and a retry with the same log id
-- writes nothing. It now accepts either a built-in pattern or one of yours,
-- and refuses a pattern that is not yours.
-- ============================================================

drop function if exists public.record_breathing_practice(
  uuid, date, uuid, int, int, int, int, boolean, smallint, text
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
  p_guidance        text
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
    id, user_id, session_id, pattern_id, user_pattern_id, pattern_name,
    cycles_completed, planned_cycles, breaths, seconds,
    ended_early, mood_before, guidance
  ) values (
    p_log_id, v_user, v_session, p_pattern_id, p_user_pattern_id, v_name,
    p_cycles, p_planned_cycles, p_breaths, p_seconds,
    p_ended_early, p_mood_before, p_guidance
  );

  return v_session;
end;
$fn$;

revoke all on function public.record_breathing_practice(
  uuid, date, uuid, uuid, int, int, int, int, boolean, smallint, text
) from public, anon;
grant execute on function public.record_breathing_practice(
  uuid, date, uuid, uuid, int, int, int, int, boolean, smallint, text
) to authenticated;

notify pgrst, 'reload schema';
