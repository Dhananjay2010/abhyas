-- Aggregations for the Progress screen.
--
-- security_invoker means these run with the caller's privileges, so the RLS
-- policies on sessions / session_sets still apply and a user can only ever
-- aggregate their own rows. Without it a view would bypass RLS entirely.

-- Volume and set count per completed session.
create view session_volume with (security_invoker = on) as
select
  s.id            as session_id,
  s.user_id,
  s.local_date,
  s.duration_seconds,
  s.is_deload,
  coalesce(sum(ss.reps * ss.weight_kg), 0)::numeric(10,2) as volume_kg,
  count(ss.id)                                            as set_count
from sessions s
left join session_exercises se on se.session_id = s.id
left join session_sets ss
       on ss.session_exercise_id = se.id
      and ss.is_warmup_set = false
      and ss.reps is not null
where s.status = 'completed'
group by s.id, s.user_id, s.local_date, s.duration_seconds, s.is_deload;

-- Best estimated 1RM per exercise per day, for the strength trend charts.
-- Epley: weight * (1 + reps / 30). Reps are capped at 12 because the formula
-- becomes unreliable on high-rep sets.
create view exercise_strength_history with (security_invoker = on) as
select
  ss.user_id,
  se.exercise_id,
  e.name                                                     as exercise_name,
  e.movement_pattern,
  s.local_date,
  max(ss.weight_kg)::numeric(6,2)                            as top_weight_kg,
  max(ss.weight_kg * (1 + least(ss.reps, 12) / 30.0))::numeric(6,2) as best_e1rm
from session_sets ss
join session_exercises se on se.id = ss.session_exercise_id
join sessions s           on s.id = se.session_id
join exercises e          on e.id = se.exercise_id
where ss.is_warmup_set = false
  and ss.reps is not null and ss.reps > 0
  and ss.weight_kg is not null and ss.weight_kg > 0
  and s.status = 'completed'
group by ss.user_id, se.exercise_id, e.name, e.movement_pattern, s.local_date;

grant select on session_volume to authenticated;
grant select on exercise_strength_history to authenticated;
