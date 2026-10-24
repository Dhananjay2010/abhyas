-- QA Pass 10 (h): Add equipment filtering to warmup_exercises
-- Warm-up and cool-down items must respect the same all-of equipment rule as working exercises

-- Add equipment_ids column to warmup_exercises
ALTER TABLE warmup_exercises
ADD COLUMN IF NOT EXISTS equipment_ids text[] NOT NULL DEFAULT '{}';

-- Populate equipment for exercises that need it
UPDATE warmup_exercises
SET equipment_ids = ARRAY['resistance_band']::text[]
WHERE slug IN ('band-pull-apart', 'band-external-rotation')
  AND equipment_ids = '{}';

-- Face pulls need cable machine
UPDATE warmup_exercises
SET equipment_ids = ARRAY['cable_machine']::text[]
WHERE slug = 'face-pull-light'
  AND equipment_ids = '{}';
