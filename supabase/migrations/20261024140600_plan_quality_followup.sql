-- QA Pass 10 Followup: Plan Quality Fixes
-- Migration 20261024140600_plan_quality_followup.sql
--
-- Fixes:
-- 1. hip-flexion-with-band: not a squat pattern or compound, not a main quad lift
--    Tag as mobility/isolation hip flexors to exclude from main-lift slots
-- 2. Upright rows (all variants): retag mechanic as isolation (not compound)
--    so strength plans give 8-15 rep schemes instead of 4×3-6
-- 3. Exercise ball crunch: add stability_ball to equipment_ids
-- 4. Knee-safe quad exercises: remove 'knee' contraindication and add cues
-- 5. Add wall-sit and spanish-squat for knee-injured users

-- All UPDATEs must have WHERE clause scoped by slug (never UPDATE without WHERE)

-- 1. Hip Flexion with Band: change from squat/compound/quads to mobility/isolation/hip_flexors
UPDATE exercises
SET 
  movement_pattern = 'other',
  mechanic = 'isolation',
  primary_muscles = ARRAY['hip_flexors']::muscle[]
WHERE slug = 'hip-flexion-with-band';

-- 2. Upright rows: retag mechanic from compound to isolation for 8-15 rep prescription
-- Check prod export for exact slugs: dumbbell-one-arm-upright-row, smith-machine-one-arm-upright-row, etc.
UPDATE exercises
SET mechanic = 'isolation'
WHERE slug IN (
  'dumbbell-one-arm-upright-row',
  'smith-machine-one-arm-upright-row',
  'smith-machine-upright-row',
  'standing-dumbbell-upright-row',
  'upright-cable-row',
  'upright-barbell-row',
  'upright-row-with-bands'
);

-- 3. Exercise ball crunch: add stability_ball to equipment_ids if missing
-- Check current equipment_ids and only update if stability_ball is not already present
UPDATE exercises
SET equipment_ids = array_append(equipment_ids, 'stability_ball')
WHERE slug = 'crunch-legs-on-exercise-ball'
  AND NOT ('stability_ball' = ANY(equipment_ids));

-- 4. Knee-safe quad exercises: remove 'knee' from contraindicated_regions
-- These exercises use limited ROM, controlled movements, or pain-free ranges

-- Leg extensions (machine, partial/pain-free range)
UPDATE exercises
SET 
  contraindicated_regions = array_remove(contraindicated_regions, 'knee'::body_region),
  cue = 'Use a pain-free partial range of motion'
WHERE slug = 'leg-extensions'
  AND 'knee' = ANY(contraindicated_regions);

-- Single-leg leg extension (machine, controlled, pain-free range)
UPDATE exercises
SET 
  contraindicated_regions = array_remove(contraindicated_regions, 'knee'::body_region),
  cue = 'Use a pain-free partial range of motion'
WHERE slug = 'single-leg-leg-extension'
  AND 'knee' = ANY(contraindicated_regions);

-- Box squat (limited depth, box at or above parallel)
UPDATE exercises
SET 
  contraindicated_regions = array_remove(contraindicated_regions, 'knee'::body_region),
  cue = 'Use a box at parallel or higher - do not go below parallel'
WHERE slug = 'box-squat'
  AND 'knee' = ANY(contraindicated_regions);

-- 5. Add wall-sit and spanish-squat if they don't exist
-- Wall sit: isometric hold, bodyweight, squat pattern, quads/glutes
INSERT INTO exercises (
  slug, name, movement_pattern, mechanic, metric, 
  primary_muscles, secondary_muscles, equipment_ids,
  level_min, contraindicated_regions, impact, spinal_load,
  tracks, default_rest_seconds, category, cue
) VALUES (
  'wall-sit',
  'Wall Sit',
  'squat',
  'isolation',
  'seconds',
  ARRAY['quads']::muscle[],
  ARRAY['glutes']::muscle[],
  ARRAY[]::text[],
  'beginner',
  ARRAY[]::body_region[],
  'low',
  'none',
  ARRAY['weights', 'bodyweight']::track_type[],
  60,
  'strength',
  'Hold an isometric squat position with back against wall, thighs parallel to ground'
) ON CONFLICT (slug) DO NOTHING;

-- Spanish squat: band-resisted, squat pattern, quads
INSERT INTO exercises (
  slug, name, movement_pattern, mechanic, metric,
  primary_muscles, secondary_muscles, equipment_ids,
  level_min, contraindicated_regions, impact, spinal_load,
  tracks, default_rest_seconds, category, cue
) VALUES (
  'spanish-squat',
  'Spanish Squat',
  'squat',
  'compound',
  'reps',
  ARRAY['quads']::muscle[],
  ARRAY['glutes']::muscle[],
  ARRAY['resistance_band']::text[],
  'beginner',
  ARRAY[]::body_region[],
  'low',
  'none',
  ARRAY['weights', 'bodyweight']::track_type[],
  90,
  'strength',
  'Band behind knees creates forward resistance - controlled squat motion'
) ON CONFLICT (slug) DO NOTHING;

-- 6. Additional contraindications from injury-deload-yoga report

-- Shoulder: Pushups and Push-Up Wide (horizontal press loads shoulders with injury)
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'shoulder'::body_region)
WHERE slug IN ('pushups', 'push-up-wide')
  AND NOT ('shoulder' = ANY(contraindicated_regions));

-- Shoulder: All upright row variants (should all have shoulder contraindication)
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'shoulder'::body_region)
WHERE slug IN (
  'upright-cable-row',
  'upright-barbell-row',
  'dumbbell-one-arm-upright-row',
  'smith-machine-one-arm-upright-row',
  'smith-machine-upright-row',
  'standing-dumbbell-upright-row',
  'upright-row-with-bands'
)
  AND NOT ('shoulder' = ANY(contraindicated_regions));

-- Lower back: All loaded side bend variants
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'lower_back'::body_region)
WHERE slug IN (
  'barbell-side-bend',
  'weighted-ball-side-bend',
  'dumbbell-side-bend',
  'one-arm-high-pulley-cable-side-bends'
)
  AND NOT ('lower_back' = ANY(contraindicated_regions));

-- Knee: Glute ham raise variants (eccentric loading at knee)
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'knee'::body_region)
WHERE slug IN ('glute-ham-raise', 'natural-glute-ham-raise')
  AND NOT ('knee' = ANY(contraindicated_regions));

-- 7. Warmup/cooldown exclusions for knee injury
-- Add contraindicated_regions column to warmup_exercises if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'warmup_exercises' 
    AND column_name = 'contraindicated_regions'
  ) THEN
    ALTER TABLE warmup_exercises 
    ADD COLUMN contraindicated_regions body_region[] DEFAULT ARRAY[]::body_region[];
  END IF;
END $$;

-- World's greatest stretch and kneeling hip flexor stretch contraindicated for knee
UPDATE warmup_exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'knee'::body_region)
WHERE slug IN ('worlds-greatest', 'hip-flexor-stretch-kneeling')
  AND NOT ('knee' = ANY(contraindicated_regions));
