-- A session records the unit it was run in.
--
-- `exercises.metric` says what an exercise is TODAY. A finished session has to
-- say what it was THEN, and the two genuinely differ:
--
--   * Every session logged before `metric` existed was prescribed in reps. On
--     Today, a plank from that era rendered as "2 x 8-12s" -- a range that was
--     set in reps, relabelled in seconds by a column that did not exist when it
--     was written.
--   * Re-tagging an exercise later (deciding a glute bridge is a hold after
--     all) would rewrite the unit on every session of it already in History.
--   * A mid-session swap can change the unit, because an alternative offered
--     for a core slot may be a hold.
--
-- See SPEC.md section 7, "Timed exercises".

alter table public.session_exercises
  add column metric public.exercise_metric not null default 'reps';

comment on column public.session_exercises.metric is
  'Unit this exercise was run in for THIS session: reps, or seconds held. '
  'Stamped when the session is built and updated by a swap. Read this rather '
  'than exercises.metric anywhere a past session is being displayed or scored, '
  'so that re-tagging an exercise does not rewrite history.';

-- Backfill from what was actually logged, which is the only honest source for
-- rows written before this column existed.

-- 1. Anything with a recorded hold was run in seconds.
update public.session_exercises se
set metric = 'seconds'
where exists (
  select 1 from public.session_sets ss
  where ss.session_exercise_id = se.id
    and ss.duration_seconds is not null
);

-- 2. Rows with no sets at all -- skipped exercises, and sessions abandoned
--    before the first set -- recorded nothing to read, so the exercise's
--    current metric is the best available answer.
update public.session_exercises se
set metric = e.metric
from public.exercises e
where e.id = se.exercise_id
  and not exists (
    select 1 from public.session_sets ss where ss.session_exercise_id = se.id
  );

-- 3. Everything else keeps the 'reps' default, which is what it was logged in.
