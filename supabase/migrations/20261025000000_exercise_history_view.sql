-- Exercise history view for efficient querying.
--
-- This view combines session_exercises with sessions to enable proper ordering
-- by completed_at (PostgREST can't order parent rows by embedded columns).
--
-- It also solves the "fetch all sessions then filter" problem: we can now
-- query and paginate directly on this view instead of fetching 1000+ session
-- rows and passing them to .in().
--
-- security_invoker = on means the view runs with the caller's RLS context,
-- so users only see their own exercise history.

create view exercise_history with (security_invoker = on) as
select
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
  and se.status = 'completed';

comment on view exercise_history is
  'Denormalized view of completed session_exercises with session metadata. '
  'Enables efficient querying by completed_at without PostgREST embedded-column '
  'ordering issues. security_invoker respects RLS on underlying tables.';

grant select on exercise_history to authenticated;
