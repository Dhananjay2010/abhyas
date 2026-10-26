-- Align e1RM formula across TypeScript and SQL with 12-rep cap
--
-- This migration:
-- 1. Updates exercise_strength_history view to use the 12-rep-capped formula
--    with clamp to 9999.99 (numeric(6,2) max).
-- 2. Backs up existing best_e1rm values before recompute.
-- 3. Recomputes exercise_progress.best_e1rm for all existing rows using the
--    capped formula, matching nextBest's filters (completed sessions, non-warmup
--    working sets, weight > 0, reps > 0, excluding timed exercises).
--
-- Formula: e1RM = w if reps = 1, else ROUND(w × (30 + min(reps, 12)) / 30, 2)
--          Exact rational arithmetic to match JS integer-hundredths calculation.
-- The 9999.99 clamp is defensive: session_sets.weight_kg <= 500 (see
-- 20260910140000_session_set_bounds.sql), so max e1RM is 500 × 1.4 = 700.
--
-- After this migration, History, Progress aggregates, and session PB tracking all
-- use the same capped formula, eliminating divergence for high-rep sets (>12 reps).
--
-- To restore pre-migration values:
-- UPDATE exercise_progress ep
-- SET best_e1rm = bak.best_e1rm
-- FROM exercise_progress_best_e1rm_backup_20261025000030 bak
-- WHERE ep.user_id = bak.user_id AND ep.exercise_id = bak.exercise_id;

-- 1. Update the exercise_strength_history view with capped formula and clamp
create or replace view exercise_strength_history with (security_invoker = on) as
select
  ss.user_id,
  se.exercise_id,
  e.name                                                     as exercise_name,
  e.movement_pattern,
  s.local_date,
  max(ss.weight_kg)::numeric(6,2)                            as top_weight_kg,
  least(
    max(
      case 
        when ss.reps = 1 then ss.weight_kg 
        else round(ss.weight_kg * (30 + least(ss.reps, 12)) / 30, 2)
      end
    ),
    9999.99
  )::numeric(6,2) as best_e1rm
from session_sets ss
join session_exercises se on se.id = ss.session_exercise_id
join sessions s           on s.id = se.session_id
join exercises e          on e.id = se.exercise_id
where ss.is_warmup_set = false
  and ss.reps is not null and ss.reps > 0
  and ss.weight_kg is not null and ss.weight_kg > 0
  and s.status = 'completed'
  and se.status = 'completed'
  and e.metric != 'seconds'
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
  -- Include all strength sessions (normalize NULL and '' to 'weights')
  and coalesce(nullif(s.actual_type::text,''),'weights') in ('weights', 'bodyweight')
group by ss.user_id, se.exercise_id, e.name, e.movement_pattern, s.local_date;

grant select on exercise_strength_history to authenticated;


-- 2. Back up existing best_e1rm values before recompute (idempotent: IF NOT EXISTS)
create table if not exists exercise_progress_best_e1rm_backup_20261025000030 as
select user_id, exercise_id, best_e1rm
from exercise_progress;

-- Enable RLS and revoke public access (prevent cross-user reads via PostgREST)
alter table exercise_progress_best_e1rm_backup_20261025000030 enable row level security;
revoke all on exercise_progress_best_e1rm_backup_20261025000030 from anon, authenticated;


-- 3. Recompute exercise_progress.best_e1rm for all existing rows
--
-- Mirrors nextBest's filters, which runs when an exercise is completed:
-- - Exercise must be completed (se.status = 'completed')
-- - Non-warmup sets only (ss.is_warmup_set = false)
-- - Working sets with weight > 0, reps > 0
-- - Excludes timed exercises (e.metric != 'seconds')
-- - Session status does NOT matter (exercises complete while session is in_progress)
--
-- Formula: same as view, with clamp to 9999.99 applied BEFORE cast to avoid overflow
-- Performance: Set-based UPDATE with `is distinct from` to only touch changed rows
-- Idempotent: running twice changes nothing (0 rows updated, updated_at unchanged)

-- Note: Unused index removed (EXPLAIN shows Seq Scan + Hash Join, index never used)
-- create index if not exists idx_session_exercises_exercise_status 
--   on session_exercises(exercise_id, status) 
--   where status = 'completed';

update exercise_progress ep
set best_e1rm = s.e1rm
from (
  select 
    ss.user_id,
    se.exercise_id,
    least(
      max(
        case 
          when ss.reps = 1 then ss.weight_kg 
          else round(ss.weight_kg * (30 + least(ss.reps, 12)) / 30, 2)
        end
      ),
      9999.99
    )::numeric(6,2) as e1rm
  from session_sets ss
  join session_exercises se on se.id = ss.session_exercise_id
  join exercises e on e.id = se.exercise_id
  where se.status = 'completed'
    and ss.is_warmup_set = false
    and ss.reps is not null and ss.reps > 0
    and ss.weight_kg is not null and ss.weight_kg > 0
    and e.metric != 'seconds'
  group by ss.user_id, se.exercise_id
) s
where ep.user_id = s.user_id
  and ep.exercise_id = s.exercise_id
  and ep.best_e1rm is distinct from s.e1rm;
