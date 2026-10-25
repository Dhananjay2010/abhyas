-- Fix e1RM formula in exercise_strength_history view.
--
-- Issue: The view used least(ss.reps, 12) which incorrectly capped reps at 12,
-- and computed weight*(1 + reps/30) even when reps=1, giving 1.0333*weight
-- instead of just weight.
--
-- Fix: Match the canonical TypeScript implementation in src/lib/program/progression.ts:
-- - When reps = 1: return weight (no estimation needed)
-- - When reps > 1: return weight * (1 + reps / 30) with NO rep cap
--
-- This migration recreates the view with the corrected formula.

create or replace view exercise_strength_history with (security_invoker = on) as
select
  ss.user_id,
  se.exercise_id,
  e.name                                                     as exercise_name,
  e.movement_pattern,
  s.local_date,
  max(ss.weight_kg)::numeric(6,2)                            as top_weight_kg,
  max(case when ss.reps = 1 then ss.weight_kg else ss.weight_kg * (1 + ss.reps / 30.0) end)::numeric(6,2) as best_e1rm
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
  -- Include all strength sessions (normalize NULL and '' to 'weights')
  and coalesce(nullif(s.actual_type::text,''),'weights') in ('weights', 'bodyweight')
group by ss.user_id, se.exercise_id, e.name, e.movement_pattern, s.local_date;

grant select on exercise_strength_history to authenticated;
