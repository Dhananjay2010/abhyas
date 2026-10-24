-- Fix mis-tagged exercises identified in QA
-- Flutter Kicks: hinge -> core (it's an ab exercise)
-- Butt Kicks: squat -> cardio (it's a running drill)
-- Overhead Slam: vertical_pull -> other (it's a throw, not a pull)

update exercises set
  movement_pattern = 'core',
  cue = 'Exercise targeting abs. ' ||
    case when 'medicine_ball' = any(equipment_ids) then 'Medicine ball.' else '' end
where slug = 'flutter-kicks';

update exercises set
  movement_pattern = 'cardio',
  cue = 'Cardio movement targeting hamstrings. Bodyweight.'
where slug in ('double-leg-butt-kick', 'single-leg-butt-kick', 'leg-butt-kick');

update exercises set
  movement_pattern = 'other',
  mechanic = null,
  cue = 'Power throw targeting shoulders. Medicine ball.'
where slug = 'overhead-slam';

update exercises set
  movement_pattern = 'other',
  mechanic = null,
  cue = 'Power throw targeting shoulders. Medicine ball.'
where slug = 'backward-medicine-ball-throw';

-- Back Flyes with Bands: horizontal_press -> rear_delt (it's a rear delt isolation)
update exercises set
  movement_pattern = 'rear_delt',
  force = 'pull',
  cue = 'Isolation pull movement targeting rear delts. Bands.'
where slug = 'back-flyes-with-bands';

-- Lying Cambered Barbell Row: isolation -> compound (it's a compound row)
update exercises set
  mechanic = 'compound',
  cue = 'Compound pull movement targeting lats, upper back. Barbell.'
where slug = 'lying-cambered-barbell-row';
