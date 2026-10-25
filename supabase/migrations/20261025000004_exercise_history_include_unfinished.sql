-- Update exercise_history view to include unfinished exercises
-- (M2: include logged working sets from exercises that ended early, were left pending, or were skipped)
--
-- Filter by set completion (logged, non-warmup sets) rather than se.status = 'completed'.
-- Exercises that have at least one working set logged appear in history, matching exercise_strength_history.
--
-- This migration creates indexes to optimize the access pattern:
-- - Filtering session_exercises by (user_id, exercise_id)
-- - Sorting by sessions.completed_at
--
-- Note: Migration version 000005 is reserved for a later least-privilege revoke.

-- Add indexes for efficient querying
-- session_exercises(user_id, exercise_id) for filtering
create index if not exists session_exercises_user_exercise_idx 
  on session_exercises (user_id, exercise_id);

-- sessions(user_id, status, completed_at) for filtering completed sessions and sorting
create index if not exists sessions_user_status_completed_idx 
  on sessions (user_id, status, completed_at desc) 
  where status = 'completed' and completed_at is not null;

-- Replace the exercise_history view to include unfinished exercises
drop view if exists exercise_history;

create view exercise_history with (security_invoker = on) as
select distinct on (se.id)
  se.id                as session_exercise_id,
  se.user_id,
  se.exercise_id,
  se.session_id,
  se.metric,
  se.status           as exercise_status,
  s.local_date,
  s.completed_at,
  s.status            as session_status
from session_exercises se
join sessions s on s.id = se.session_id
where s.status = 'completed'
  and s.completed_at is not null
  and se.status != 'swapped_out'
  and exists (
    select 1
    from session_sets ss
    where ss.session_exercise_id = se.id
      and ss.is_warmup_set = false
  );

comment on view exercise_history is
  'Denormalized view of session_exercises with at least one working set logged, '
  'joined with session metadata. Includes exercises that ended early, were left pending, '
  'or were skipped inside completed sessions. Enables efficient querying by completed_at '
  'without PostgREST embedded-column ordering issues. security_invoker respects RLS on '
  'underlying tables.';

grant select on exercise_history to authenticated;
