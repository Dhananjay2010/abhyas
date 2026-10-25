-- Abhyas — reference data seed (equipment, warm-ups, breathing patterns)
-- Exercises and yoga videos are seeded separately: exercises from a curated import,
-- yoga only after every YouTube id has been verified to resolve.

-- ============================================================
-- EQUIPMENT
-- ============================================================
insert into equipment (id, name, category, sort_order) values
  ('bodyweight',        'Bodyweight (no equipment)', 'bodyweight',  0),
  ('yoga_mat',          'Yoga mat',                  'bodyweight',  1),
  ('pull_up_bar',       'Pull-up bar',               'bodyweight',  2),
  ('dip_bars',          'Dip bars / parallettes',    'bodyweight',  3),
  ('barbell',           'Barbell',                   'free_weight', 10),
  ('ez_bar',            'EZ curl bar',               'free_weight', 11),
  ('dumbbell',          'Dumbbells',                 'free_weight', 12),
  ('kettlebell',        'Kettlebell',                'free_weight', 13),
  ('trap_bar',          'Trap / hex bar',            'free_weight', 14),
  ('weight_plate',      'Weight plates',             'free_weight', 15),
  ('squat_rack',        'Squat rack / power cage',   'machine',     20),
  ('flat_bench',        'Flat bench',                'machine',     21),
  ('adjustable_bench',  'Adjustable bench',          'machine',     22),
  ('smith_machine',     'Smith machine',             'machine',     23),
  ('leg_press',         'Leg press',                 'machine',     24),
  ('hack_squat',        'Hack squat',                'machine',     25),
  ('leg_curl',          'Leg curl machine',          'machine',     26),
  ('leg_extension',     'Leg extension machine',     'machine',     27),
  ('chest_press_machine','Chest press machine',      'machine',     28),
  ('pec_deck',          'Pec deck',                  'machine',     29),
  ('lat_pulldown',      'Lat pulldown',              'machine',     30),
  ('seated_row_machine','Seated row machine',        'machine',     31),
  ('shoulder_press_machine','Shoulder press machine','machine',     32),
  ('treadmill',         'Treadmill',                 'machine',     40),
  ('stationary_bike',   'Stationary bike',           'machine',     41),
  ('rowing_machine',    'Rowing machine',            'machine',     42),
  ('elliptical',        'Elliptical',                'machine',     43),
  ('cable_machine',     'Cable machine',             'cable',       50),
  ('resistance_band',   'Resistance bands',          'accessory',   60),
  ('foam_roller',       'Foam roller',               'accessory',   61),
  ('jump_rope',         'Jump rope',                 'accessory',   62),
  ('medicine_ball',     'Medicine ball',             'accessory',   63),
  ('stability_ball',    'Stability ball',            'accessory',   64),
  ('ab_wheel',          'Ab wheel',                  'accessory',   65),
  ('trx',               'Suspension trainer (TRX)',  'accessory',   66),
  ('dip_belt',          'Dip belt',                  'accessory',   67)
on conflict (id) do nothing;

-- ============================================================
-- BREATHING PATTERNS  (meditation track, v1)
-- Timings are defaults; every one is user-adjustable in Settings.
-- ============================================================
insert into breathing_patterns
  (slug, name, description, inhale_seconds, hold_in_seconds, exhale_seconds, hold_out_seconds,
   default_cycles, benefit, contraindications, level, sort_order) values
  ('box-breathing', 'Box Breathing',
   'Equal counts on all four phases. Inhale, hold, exhale, hold — a square.',
   4, 4, 4, 4, 10, 'Focus and steady calm. Good before a heavy session.',
   'Ease off the holds if you have high blood pressure or feel light-headed.',
   'beginner', 1),

  ('four-seven-eight', '4-7-8 Breathing',
   'Inhale for 4, hold for 7, exhale slowly for 8. The long exhale is the point.',
   4, 7, 8, 0, 4, 'Winding down and falling asleep.',
   'Not while pregnant, or with low blood pressure. Start with 4 cycles only.',
   'beginner', 2),

  ('coherent-breathing', 'Coherent Breathing',
   'Smooth, even breathing at about five and a half breaths a minute. No holds.',
   5.5, 0, 5.5, 0, 30, 'Baseline calm and heart-rate variability. The safest daily default.',
   null, 'beginner', 3),

  ('physiological-sigh', 'Physiological Sigh',
   'A double inhale through the nose — one full, one short sniff on top — then a long exhale through the mouth.',
   3, 0, 6, 0, 5, 'The fastest way down from acute stress. Works in under a minute.',
   null, 'beginner', 4),

  ('nadi-shodhana', 'Nadi Shodhana (Alternate Nostril)',
   'Close one nostril, inhale; close the other, exhale. Alternate sides each cycle.',
   4, 4, 8, 0, 10, 'Balance and mental clarity.',
   'Skip if your nose is blocked.', 'intermediate', 5),

  ('bhramari', 'Bhramari (Humming Bee)',
   'Inhale through the nose, then hum steadily all the way through the exhale.',
   4, 0, 8, 0, 8, 'Quietens anxiety quickly; the vibration is the active ingredient.',
   'Skip with an ear infection.', 'beginner', 6)
on conflict (slug) do nothing;

-- ============================================================
-- WARM-UP LIBRARY
-- target_regions drives injury-aware prehab selection; target_muscles drives
-- "mobilise what you are about to train".
-- ============================================================
insert into warmup_exercises (slug, name, type, target_regions, target_muscles, duration_seconds, instructions) values
  -- general cardio (first 5 minutes)
  ('brisk-walk',        'Brisk walk / treadmill',   'cardio', '{}', '{cardio}', 300, '{"Easy pace. You should still be able to talk."}'),
  ('easy-bike',         'Easy stationary bike',     'cardio', '{}', '{cardio,quads}', 300, '{"Light resistance, steady cadence."}'),
  ('easy-row',          'Easy rowing',              'cardio', '{}', '{cardio,upper_back}', 300, '{"Low stroke rate, focus on the leg drive."}'),
  ('skipping-light',    'Light skipping',           'cardio', '{ankle}', '{cardio,calves}', 180, '{"Small hops, stay on the balls of your feet."}'),
  ('march-in-place',    'Marching in place',        'cardio', '{}', '{cardio}', 240, '{"Drive the knees to hip height. No equipment needed."}'),

  -- upper body mobility
  ('arm-circles',       'Arm circles',              'mobility', '{shoulder}', '{front_delts,side_delts,rear_delts}', 60, '{"Ten small circles forward, ten back, then widen them."}'),
  ('band-pull-apart',   'Band pull-apart',          'mobility', '{shoulder,upper_back}', '{rear_delts,upper_back}', 60, '{"Arms straight, pull the band to your chest, squeeze the shoulder blades."}'),
  ('shoulder-dislocate','Shoulder pass-through',    'mobility', '{shoulder}', '{front_delts,rear_delts}', 60, '{"Wide grip on a band or stick, pass it overhead and behind. Widen the grip if it pinches."}'),
  ('scapular-pushup',   'Scapular push-up',         'mobility', '{shoulder,upper_back}', '{upper_back,chest}', 45, '{"Arms locked. Pinch the shoulder blades together, then push them apart."}'),
  ('cat-cow',           'Cat-cow',                  'mobility', '{lower_back,upper_back}', '{lower_back,abs}', 60, '{"On all fours, arch and round the spine with the breath."}'),
  ('thoracic-rotation', 'Thoracic rotation',        'mobility', '{upper_back}', '{upper_back,obliques}', 60, '{"Half-kneeling, hand behind the head, rotate the ribcage open."}'),
  ('wall-slide',        'Wall slide',               'mobility', '{shoulder}', '{front_delts,upper_back}', 45, '{"Back and arms flat to the wall, slide the arms overhead without losing contact."}'),
  ('wrist-circles',     'Wrist circles and rocks',  'mobility', '{wrist,elbow}', '{forearms}', 45, '{"Circles both ways, then rock forward and back on your palms."}'),

  -- lower body mobility
  ('leg-swing-front',   'Leg swings (front to back)','mobility', '{hip}', '{hamstrings,hip_flexors}', 45, '{"Hold something. Ten swings per leg, relaxed."}'),
  ('leg-swing-side',    'Leg swings (side to side)', 'mobility', '{hip}', '{adductors,abductors}', 45, '{"Ten per leg, keep the torso upright."}'),
  ('bodyweight-squat',  'Bodyweight squat',          'mobility', '{knee,hip}', '{quads,glutes}', 60, '{"Slow and full depth. Pause at the bottom."}'),
  ('hip-circles',       'Hip circles',               'mobility', '{hip}', '{hip_flexors,glutes}', 45, '{"Hands on hips, big slow circles both directions."}'),
  ('walking-lunge',     'Walking lunge',             'mobility', '{hip,knee}', '{quads,glutes,hip_flexors}', 60, '{"Long stride, upright torso, controlled."}'),
  ('ankle-rock',        'Ankle rocks',               'mobility', '{ankle}', '{calves}', 45, '{"Knee tracks over the toes, heel stays down."}'),
  ('glute-bridge',      'Glute bridge',              'mobility', '{hip,lower_back}', '{glutes,hamstrings}', 60, '{"Squeeze at the top for a second. Ribs down."}'),
  ('worlds-greatest',   'World''s greatest stretch', 'mobility', '{hip,upper_back}', '{hip_flexors,hamstrings,upper_back}', 90, '{"Deep lunge, elbow to the instep, then rotate the top arm to the ceiling."}'),

  -- prehab, selected when the user has flagged that region
  ('band-external-rotation','Band external rotation','prehab', '{shoulder}', '{rear_delts}', 60, '{"Elbow pinned to your side, rotate the forearm outward. Light band."}'),
  ('face-pull-light',   'Light face pull',           'prehab', '{shoulder,upper_back}', '{rear_delts,upper_back}', 60, '{"Pull to the forehead, elbows high. Very light."}'),
  ('bird-dog',          'Bird dog',                  'prehab', '{lower_back,core}', '{lower_back,abs,glutes}', 60, '{"Opposite arm and leg. Do not let the hips rotate."}'),
  ('dead-bug',          'Dead bug',                  'prehab', '{lower_back,core}', '{abs}', 60, '{"Lower back stays flat on the floor throughout."}'),
  ('clamshell',         'Clamshell',                 'prehab', '{hip,knee}', '{abductors,glutes}', 60, '{"On your side, knees bent, open the top knee without rolling back."}'),
  ('terminal-knee-ext', 'Terminal knee extension',   'prehab', '{knee}', '{quads}', 60, '{"Band behind the knee, straighten the leg against it."}'),
  ('calf-raise-slow',   'Slow calf raise',           'prehab', '{ankle}', '{calves}', 60, '{"Three seconds up, three down, full range."}'),
  ('neck-cars',         'Neck rotations',            'prehab', '{neck}', '{neck}', 45, '{"Slow, controlled, small range. Never force it."}')
on conflict (slug) do nothing;
