-- Fix contraindication and equipment tags based on QA pass 5 findings
-- This migration is idempotent (safe to re-run)
-- All updates match exercises by slug, guarded on existence

-- Part 1: Fix shoulder contraindications for overhead and end-range movements

-- Pullover: loaded end-range shoulder flexion under stretch
-- QA M6: Use only REAL prod slugs (dumbbell-pullover, barbell-pullover, cable-pullover don't exist)
UPDATE exercises
SET contraindicated_regions = 
  CASE 
    WHEN 'shoulder' = ANY(contraindicated_regions) THEN contraindicated_regions
    ELSE array_append(contraindicated_regions, 'shoulder'::body_region)
  END
WHERE slug IN ('straight-arm-dumbbell-pullover')
  AND NOT ('shoulder' = ANY(contraindicated_regions));

-- Overhead front raises: loaded full flexion to overhead
UPDATE exercises
SET contraindicated_regions = 
  CASE 
    WHEN 'shoulder' = ANY(contraindicated_regions) THEN contraindicated_regions
    ELSE array_append(contraindicated_regions, 'shoulder'::body_region)
  END
WHERE slug IN (
  'standing-dumbbell-straight-arm-front-delt-raise-above-head',
  'standing-front-barbell-raise-over-head',
  'single-dumbbell-raise'
)
  AND NOT ('shoulder' = ANY(contraindicated_regions));

-- Seated dumbbell press: should be tagged shoulder like other overhead presses
-- QA M6: dumbbell-seated-shoulder-press doesn't exist in prod, only seated-dumbbell-press
UPDATE exercises
SET contraindicated_regions = 
  CASE 
    WHEN 'shoulder' = ANY(contraindicated_regions) THEN contraindicated_regions
    ELSE array_append(contraindicated_regions, 'shoulder'::body_region)
  END
WHERE slug IN ('seated-dumbbell-press')
  AND NOT ('shoulder' = ANY(contraindicated_regions));


-- Part 2: Fix lower back contraindications for spinal flexion exercises

-- Crunches: repeated spinal flexion, problematic for acute lower back injury
-- QA M6: 'crunch' slug doesn't exist in prod; use real slugs
UPDATE exercises
SET contraindicated_regions = 
  CASE 
    WHEN 'lower_back' = ANY(contraindicated_regions) THEN contraindicated_regions
    ELSE array_append(contraindicated_regions, 'lower_back'::body_region)
  END
WHERE slug IN (
  'crunch-hands-overhead',
  'decline-crunch',
  'air-bike'
)
  AND NOT ('lower_back' = ANY(contraindicated_regions));


-- Part 3: Fix equipment tags for exercises needing unlisted equipment

-- Inverted row needs a bar or sturdy surface (only if currently untagged)
UPDATE exercises
SET equipment_ids = ARRAY['pull_up_bar']::text[]
WHERE slug IN ('inverted-row')
  AND equipment_ids = ARRAY[]::text[];

-- QA M1: table-row is a bodyweight exercise, needs NO equipment
-- (This will be reverted in 140000 migration since table-row should be empty equipment)


-- Part 4: Fix rows tagged as isolation (should be compound)

UPDATE exercises
SET mechanic = 'compound'
WHERE slug IN (
  'alternating-kettlebell-row',
  'incline-bench-pull',
  'bent-over-two-dumbbell-row-with-palms-in',
  'bent-over-two-dumbbell-row'
)
  AND mechanic = 'isolation';


-- Part 5: Fix movement pattern misclassifications

-- Pullover is a lat/serratus movement, not a press
-- QA M6: Use only REAL prod slugs
UPDATE exercises
SET movement_pattern = 'horizontal_pull'
WHERE slug IN (
  'straight-arm-dumbbell-pullover'
)
  AND movement_pattern = 'horizontal_press';

-- Snatches are Olympic lifts (hinge/power), not shoulder presses
-- QA M6: Use only REAL prod slugs (kettlebell-, dumbbell-, barbell-, hang-, power-snatch don't exist)
UPDATE exercises
SET movement_pattern = 'hinge'
WHERE slug IN (
  'one-arm-kettlebell-split-snatch',
  'double-kettlebell-snatch',
  'one-arm-kettlebell-snatch'
)
  AND movement_pattern = 'vertical_press';

-- Renegade row is a core anti-rotation drill with a row component
-- Keep as horizontal_pull but note it's more of a core stability exercise
-- (This is a judgment call - could be argued either way)

-- Glute kickback is hip extension isolation, not a compound hinge
UPDATE exercises
SET mechanic = 'isolation',
    movement_pattern = 'other'
WHERE slug = 'glute-kickback'
  AND (mechanic != 'isolation' OR movement_pattern = 'hinge');
