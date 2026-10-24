-- Remove dead swapped_out filter from exercise_history view
--
-- The swapped_out filter has never been used: swapExercise changes exercise_id,
-- not status, so swapped rows naturally disappear from history when grouped by
-- the new exercise_id. The filter blocks nothing and was defensive code.
--
-- Removing it simplifies the view without changing behavior.

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
  and exists (
    select 1
    from session_sets ss
    where ss.session_exercise_id = se.id
      and ss.is_warmup_set = false
  );

comment on view exercise_history is
  'Denormalized view of session_exercises with at least one working set logged, '
  'joined with session metadata. Includes exercises that ended early, were left pending, '
  'or were skipped inside completed sessions. Swapped exercises appear under their new '
  'exercise_id (swapExercise changes exercise_id, not status). Enables efficient querying '
  'by completed_at without PostgREST embedded-column ordering issues. security_invoker '
  'respects RLS on underlying tables.';

grant select on exercise_history to authenticated;
