-- Exercises measured in seconds, not reps.
--
-- A plank was being prescribed as "2 sets x 8-12 reps" with a reps box and a
-- kilograms box, so the only way to record a 45-second hold was to invent a
-- rep count -- and that invented number then fed the progression engine.
--
-- `metric` is curated per exercise rather than guessed from the name: "Iron
-- Cross" is a dumbbell raise done for reps, "Isometric Wipers" is a hold, and
-- no name rule separates them. Everything stays `reps` unless it is listed
-- below, so the default is the safe one.
--
-- A seconds exercise keeps using target_reps_min / target_reps_max. Those
-- columns are a TARGET RANGE IN THE EXERCISE'S OWN METRIC; `metric` says which
-- unit that is. The names are historical. See SPEC.md section 7, "Timed
-- exercises".

create type exercise_metric as enum ('reps','seconds');

alter table exercises
  add column metric exercise_metric not null default 'reps';

comment on column exercises.metric is
  'Unit for this exercise''s target range and logged sets: reps, or seconds held. '
  'When seconds, program_day_exercises.target_reps_min/max are seconds and a set '
  'records session_sets.duration_seconds with reps left null.';

comment on column program_day_exercises.target_reps_min is
  'Low end of the target range, in the exercise''s own metric (see exercises.metric).';
comment on column program_day_exercises.target_reps_max is
  'High end of the target range, in the exercise''s own metric (see exercises.metric).';

update exercises set metric = 'seconds'
where slug in (
  'plank',
  'side-bridge',
  'isometric-chest-squeezes',
  'isometric-wipers',
  'isometric-neck-exercise-front-and-back',
  'isometric-neck-exercise-sides'
);
