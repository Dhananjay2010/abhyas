-- The block generator fills each training day by movement pattern, not by muscle.
-- "Push day needs a horizontal press" is the question it asks; this column answers it.

create type movement_pattern as enum (
  'horizontal_press',
  'vertical_press',
  'horizontal_pull',
  'vertical_pull',
  'squat',
  'hinge',
  'lunge',
  'calf',
  'core',
  'biceps',
  'triceps',
  'lateral_delt',
  'rear_delt',
  'forearm',
  'neck',
  'carry',
  'cardio',
  'other'
);

alter table exercises add column movement_pattern movement_pattern not null default 'other';
create index exercises_pattern_idx on exercises (movement_pattern) where is_active;

-- A short factual cue written from the exercise's own attributes, shown when we
-- have no hand-written instructions. We deliberately do not import third-party
-- instruction prose -- see SPEC section 10 on why only structural data is seeded.
alter table exercises add column cue text;
