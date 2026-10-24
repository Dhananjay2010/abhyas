-- Exclude strength sessions with 0 working sets from progress views.
--
-- Defense in depth: warmup-only sessions should not count toward volume or
-- appear in strength history charts. This recreates session_volume and
-- exercise_strength_history to exclude sessions with no working sets.
--
-- Idempotent: Uses DROP VIEW IF EXISTS and CREATE OR REPLACE VIEW.

-- Drop and recreate session_volume (idempotent)
drop view if exists session_volume;

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
      and (ss.reps is not null or ss.duration_seconds is not null)
where s.status = 'completed'
group by s.id, s.user_id, s.local_date, s.duration_seconds, s.is_deload
-- Exclude strength sessions with 0 working sets
having count(case when ss.is_warmup_set = false
                    and (ss.reps is not null and ss.reps > 0
                         or ss.duration_seconds is not null and ss.duration_seconds > 0)
                  then 1 end) > 0
    or s.actual_type not in ('weights', 'bodyweight');

-- Drop and recreate exercise_strength_history (idempotent)
drop view if exists exercise_strength_history;

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
group by ss.user_id, se.exercise_id, e.name, e.movement_pattern, s.local_date;

-- Restore grants (idempotent - GRANT is already idempotent in PostgreSQL)
grant select on session_volume to authenticated;
grant select on exercise_strength_history to authenticated;
