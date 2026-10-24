-- QA Bot 1 catalogue fixes for intermediate gym profile plan quality
-- H3: Fix exercise tagging issues found in live plan review
-- Idempotent: all updates match by slug with WHERE guards

-- Alternating Kettlebell Row and Incline Bench Pull: isolation → compound
UPDATE exercises
SET mechanic = 'compound'
WHERE slug = 'alternating-kettlebell-row'
  AND mechanic = 'isolation';

UPDATE exercises
SET mechanic = 'compound'
WHERE slug = 'incline-bench-pull'
  AND mechanic = 'isolation';

-- Lunge Sprint: not a strength movement, it's conditioning/cardio
-- Remove from strength slots by tagging appropriately
UPDATE exercises
SET level_min = 'intermediate',
    impact = 'high'
WHERE slug = 'lunge-sprint'
  AND (level_min != 'intermediate' OR impact != 'high');

-- Dumbbell Seated Box Jump: this is plyometric, not a strength squat compound
-- Tag with high impact and intermediate level to exclude from main slots
UPDATE exercises
SET impact = 'high',
    level_min = 'intermediate'
WHERE slug = 'dumbbell-seated-box-jump'
  AND (impact != 'high' OR level_min != 'intermediate');

-- Sumo Deadlift variants: primary muscle should be glutes, not hamstrings
-- These are hip-dominant hinge movements
UPDATE exercises
SET primary_muscles = ARRAY['glutes']::muscle[]
WHERE slug IN (
    'sumo-deadlift',
    'reverse-band-sumo-deadlift',
    'sumo-deadlift-with-bands',
    'sumo-deadlift-with-chains'
  )
  AND NOT (primary_muscles = ARRAY['glutes']::muscle[]);
