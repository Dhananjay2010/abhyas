-- Workout Quality Fixes: Exercise ordering, catalogue data quality, and cool-down stretches
-- This migration is idempotent (safe to re-run)

-- Part 0: Add missing staple exercises needed for proper plan generation
-- These fill gaps where beginners have no equipment-free options for key patterns

-- Pike Push-Up: equipment-free vertical press for beginners/intermediates
INSERT INTO exercises (
  slug, name, aliases, tracks, category, mechanic, force, 
  primary_muscles, secondary_muscles, equipment_ids, level_min,
  movement_pattern, metric, impact, spinal_load, default_rest_seconds,
  instructions, contraindicated_regions, source, source_licence, is_active
) VALUES (
  'pike-push-up',
  'Pike Push-Up',
  ARRAY['pike pushup', 'shoulder push-up']::text[],
  ARRAY['weights', 'bodyweight']::track_type[],
  'strength',
  'compound',
  'push',
  ARRAY['front_delts', 'triceps']::muscle[],
  ARRAY['side_delts', 'chest']::muscle[],
  ARRAY[]::text[],
  'beginner',
  'vertical_press',
  'reps',
  'low',
  'none',
  90,
  ARRAY[
    'Start in a downward dog position with hips high',
    'Keep your legs and back as straight as possible',
    'Lower your head toward the ground by bending elbows',
    'Push back up to the starting position',
    'Focus on shoulders doing the work, not chest'
  ],
  ARRAY[]::body_region[],
  'curated',
  'public domain',
  true
)
ON CONFLICT (slug) DO UPDATE SET
  movement_pattern = EXCLUDED.movement_pattern,
  mechanic = EXCLUDED.mechanic,
  primary_muscles = EXCLUDED.primary_muscles,
  equipment_ids = EXCLUDED.equipment_ids,
  level_min = EXCLUDED.level_min;

-- Doorway Row: equipment-free horizontal pull for beginners
-- Uses a doorframe for support, needs no equipment
INSERT INTO exercises (
  slug, name, aliases, tracks, category, mechanic, force,
  primary_muscles, secondary_muscles, equipment_ids, level_min,
  movement_pattern, metric, impact, spinal_load, default_rest_seconds,
  instructions, contraindicated_regions, source, source_licence, is_active
) VALUES (
  'doorway-row',
  'Doorway Row',
  ARRAY['door row', 'doorframe row']::text[],
  ARRAY['bodyweight']::track_type[],
  'strength',
  'compound',
  'pull',
  ARRAY['lats', 'upper_back']::muscle[],
  ARRAY['biceps', 'rear_delts']::muscle[],
  ARRAY[]::text[],
  'beginner',
  'horizontal_pull',
  'reps',
  'low',
  'none',
  120,
  ARRAY[
    'Stand in a doorway and grab both sides of the frame',
    'Walk your feet forward and lean back with straight arms',
    'Keep your body straight from head to heels',
    'Pull your chest toward the doorway by bending elbows',
    'Lower back down with control'
  ],
  ARRAY[]::body_region[],
  'curated',
  'public domain',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- Glute Bridge: essential hip hinge for beginners
INSERT INTO exercises (
  slug, name, aliases, tracks, category, mechanic, force,
  primary_muscles, secondary_muscles, equipment_ids, level_min,
  movement_pattern, metric, impact, spinal_load, default_rest_seconds,
  instructions, contraindicated_regions, source, source_licence, is_active
) VALUES (
  'glute-bridge',
  'Glute Bridge',
  ARRAY['hip bridge', 'basic bridge']::text[],
  ARRAY['weights', 'bodyweight']::track_type[],
  'strength',
  'compound',
  'push',
  ARRAY['glutes', 'hamstrings']::muscle[],
  ARRAY['lower_back', 'abs']::muscle[],
  ARRAY[]::text[],
  'beginner',
  'hinge',
  'reps',
  'low',
  'none',
  90,
  ARRAY[
    'Lie on your back with knees bent, feet flat on the floor',
    'Place arms at your sides, palms down',
    'Push through your heels to lift hips toward ceiling',
    'Squeeze glutes at the top',
    'Lower hips back down with control'
  ],
  ARRAY[]::body_region[],
  'curated',
  'public domain',
  true
)
ON CONFLICT (slug) DO NOTHING;


-- Part 1: Fix exercise catalogue data quality issues
-- These are the exercises found by QA with wrong movement patterns, mechanics, or difficulty

-- Flutter Kicks: Core exercise, not hinge. Targets abs, not glutes.
UPDATE exercises 
SET movement_pattern = 'core', 
    primary_muscles = ARRAY['abs']::muscle[], 
    mechanic = 'isolation'
WHERE slug = 'flutter-kicks' 
  AND (movement_pattern != 'core' OR 'glutes' = ANY(primary_muscles) OR mechanic != 'isolation');

-- Butt Kicks (both variants): Cardio drill, not squat. Targets hamstrings.
UPDATE exercises 
SET movement_pattern = 'cardio', 
    primary_muscles = ARRAY['hamstrings']::muscle[], 
    mechanic = 'compound'
WHERE slug IN ('double-leg-butt-kick', 'single-leg-butt-kick')
  AND (movement_pattern != 'cardio' OR mechanic != 'compound');

-- Knee Tuck Jump: Plyometric squat targeting quads, requires intermediate level
UPDATE exercises 
SET movement_pattern = 'squat', 
    primary_muscles = ARRAY['quads']::muscle[], 
    level_min = 'intermediate'
WHERE slug = 'knee-tuck-jump'
  AND (movement_pattern != 'squat' OR level_min = 'beginner');

-- Butt Lift (Bridge): Should be compound, not isolation
UPDATE exercises 
SET mechanic = 'compound'
WHERE slug = 'butt-lift-bridge' 
  AND mechanic = 'isolation';

-- Plyometric exercises should be intermediate+ (beginners should not do jumping exercises)
UPDATE exercises 
SET level_min = 'intermediate'
WHERE slug IN (
  'lateral-bound',
  'plyo-push-up', 
  'rocket-jump',
  'scissors-jump',
  'split-jump',
  'standing-long-jump',
  'star-jump'
) AND level_min = 'beginner';

-- Tuck Crunch and Wood Chop are core exercises, not plyometric - keep as beginner
UPDATE exercises 
SET level_min = 'beginner'
WHERE slug IN ('tuck-crunch', 'standing-cable-wood-chop')
  AND level_min != 'beginner';


-- Part 2: Add 'stretch' type to warmup_type enum for cool-down exercises
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'warmup_type' AND e.enumlabel = 'stretch'
  ) THEN
    ALTER TYPE warmup_type ADD VALUE 'stretch';
  END IF;
END $$;


-- Part 3: Add stretch exercises for cool-down
-- These are timed holds (30s each) of actual stretches, not the mobility work from warm-up

INSERT INTO warmup_exercises (slug, name, type, target_regions, target_muscles, duration_seconds, instructions) 
VALUES
  (
    'standing-hamstring-stretch',
    'Standing Hamstring Stretch',
    'stretch',
    ARRAY['hip', 'knee']::body_region[],
    ARRAY['hamstrings']::muscle[],
    30,
    ARRAY[
      'Stand with feet together',
      'Hinge forward from the hips, keeping back straight',
      'Reach toward your toes',
      'Hold the stretch, breathing slowly',
      'You should feel it in the back of your thighs'
    ]
  ),
  (
    'quad-stretch',
    'Standing Quad Stretch',
    'stretch',
    ARRAY['hip', 'knee']::body_region[],
    ARRAY['quads']::muscle[],
    30,
    ARRAY[
      'Stand on one leg',
      'Pull your other foot toward your glutes',
      'Keep knees together',
      'Hold for 30 seconds, then switch sides',
      'You should feel it in the front of your thigh'
    ]
  ),
  (
    'chest-doorway-stretch',
    'Chest Doorway Stretch',
    'stretch',
    ARRAY['shoulder']::body_region[],
    ARRAY['chest']::muscle[],
    30,
    ARRAY[
      'Place your forearm against a wall or doorway',
      'Step forward with the same-side leg',
      'Turn your body away gently',
      'Hold the stretch',
      'You should feel it across your chest'
    ]
  ),
  (
    'shoulder-cross-body-stretch',
    'Cross-Body Shoulder Stretch',
    'stretch',
    ARRAY['shoulder']::body_region[],
    ARRAY['rear_delts']::muscle[],
    30,
    ARRAY[
      'Pull one arm across your chest',
      'Use your other hand to gently press it closer',
      'Keep shoulders down and relaxed',
      'Hold for 30 seconds, then switch sides',
      'You should feel it in the back of your shoulder'
    ]
  ),
  (
    'triceps-overhead-stretch',
    'Overhead Triceps Stretch',
    'stretch',
    ARRAY['shoulder', 'elbow']::body_region[],
    ARRAY['triceps']::muscle[],
    30,
    ARRAY[
      'Reach one arm overhead',
      'Bend at the elbow, hand behind your head',
      'Use your other hand to gently pull the elbow',
      'Hold for 30 seconds, then switch sides',
      'You should feel it in the back of your upper arm'
    ]
  ),
  (
    'seated-spinal-twist',
    'Seated Spinal Twist',
    'stretch',
    ARRAY['core', 'lower_back', 'hip']::body_region[],
    ARRAY['abs', 'lower_back']::muscle[],
    30,
    ARRAY[
      'Sit with legs extended',
      'Cross one leg over the other',
      'Twist toward the bent knee',
      'Hold for 30 seconds, then switch sides',
      'You should feel it in your spine and hip'
    ]
  ),
  (
    'calf-stretch-wall',
    'Wall Calf Stretch',
    'stretch',
    ARRAY['ankle']::body_region[],
    ARRAY['calves']::muscle[],
    30,
    ARRAY[
      'Face a wall, one foot forward, one back',
      'Keep back leg straight, heel on ground',
      'Lean into the wall',
      'Hold for 30 seconds, then switch sides',
      'You should feel it in the back of your lower leg'
    ]
  ),
  (
    'glute-stretch-seated',
    'Seated Figure-4 Glute Stretch',
    'stretch',
    ARRAY['hip']::body_region[],
    ARRAY['glutes']::muscle[],
    30,
    ARRAY[
      'Sit on the ground',
      'Cross one ankle over the opposite knee',
      'Gently press the crossed knee away',
      'Hold for 30 seconds, then switch sides',
      'You should feel it in your glute and hip'
    ]
  ),
  (
    'hip-flexor-stretch-kneeling',
    'Kneeling Hip Flexor Stretch',
    'stretch',
    ARRAY['hip']::body_region[],
    ARRAY['quads']::muscle[],
    30,
    ARRAY[
      'Kneel on one knee, other foot forward',
      'Push your hips forward gently',
      'Keep your back straight',
      'Hold for 30 seconds, then switch sides',
      'You should feel it in the front of your hip'
    ]
  ),
  (
    'lat-stretch-overhead',
    'Overhead Lat Stretch',
    'stretch',
    ARRAY['shoulder', 'upper_back']::body_region[],
    ARRAY['lats']::muscle[],
    30,
    ARRAY[
      'Reach both arms overhead',
      'Grab one wrist with the other hand',
      'Lean to the side',
      'Hold for 30 seconds, then switch sides',
      'You should feel it along the side of your back'
    ]
  ),
  (
    'childs-pose',
    'Child''s Pose',
    'stretch',
    ARRAY['lower_back', 'hip', 'shoulder']::body_region[],
    ARRAY['lower_back', 'lats']::muscle[],
    30,
    ARRAY[
      'Kneel and sit back on your heels',
      'Reach arms forward on the ground',
      'Rest your forehead down',
      'Breathe slowly and relax',
      'You should feel it in your back and shoulders'
    ]
  ),
  (
    'cat-cow-stretch',
    'Cat-Cow Stretch',
    'stretch',
    ARRAY['core', 'lower_back', 'upper_back']::body_region[],
    ARRAY['abs', 'lower_back']::muscle[],
    30,
    ARRAY[
      'Start on hands and knees',
      'Arch your back, looking up (cow)',
      'Round your back, tucking chin (cat)',
      'Move slowly between positions',
      'You should feel it throughout your spine'
    ]
  )
ON CONFLICT (slug) DO NOTHING;


-- Part 4: Create helper function to select cool-down stretches based on what was trained
-- This will be used by the session runner to pick appropriate stretches

CREATE OR REPLACE FUNCTION select_cooldown_stretches(
  p_trained_muscles muscle[]
) RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  duration_seconds int,
  instructions text[]
) LANGUAGE sql STABLE AS $$
  WITH muscle_match AS (
    SELECT 
      w.id,
      w.slug,
      w.name,
      w.duration_seconds,
      w.instructions,
      -- Count how many of today's muscles this stretch targets
      (SELECT COUNT(*) 
       FROM unnest(w.target_muscles) m 
       WHERE m = ANY(p_trained_muscles)
      ) as overlap
    FROM warmup_exercises w
    WHERE w.type = 'stretch' AND w.is_active = true
  )
  -- Return stretches that hit trained muscles first, then general stretches
  SELECT 
    muscle_match.id, 
    muscle_match.slug, 
    muscle_match.name, 
    muscle_match.duration_seconds, 
    muscle_match.instructions
  FROM muscle_match
  ORDER BY overlap DESC, name ASC
  LIMIT 5;
$$;

COMMENT ON FUNCTION select_cooldown_stretches IS 
  'Returns 5 stretches prioritizing muscles that were trained in the session';
