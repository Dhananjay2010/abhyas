-- QA Pass 10 Followup: Plan Quality Fixes
-- Migration 20261024140600_plan_quality_followup.sql
--
-- Fixes:
-- 1. hip-flexion-with-band: not a squat pattern or compound, not a main quad lift
--    Tag as mobility/isolation hip flexors to exclude from main-lift slots
-- 2. Upright rows (all variants): retag mechanic as isolation (not compound)
--    so strength plans give 8-15 rep schemes instead of 4×3-6
-- 3. Exercise ball crunch: add stability_ball to equipment_ids
-- 4. (No catalogue rows for knee-safe quad alternatives needed; all exist in prod export)

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
WHERE slug LIKE '%upright-row%' OR slug LIKE '%upright_row%';

-- 3. Exercise ball crunch: add stability_ball to equipment_ids if missing
-- Check current equipment_ids and only update if stability_ball is not already present
UPDATE exercises
SET equipment_ids = array_append(equipment_ids, 'stability_ball')
WHERE slug = 'crunch-legs-on-exercise-ball'
  AND NOT ('stability_ball' = ANY(equipment_ids));
