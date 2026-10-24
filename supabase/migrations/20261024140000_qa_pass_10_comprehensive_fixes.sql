-- QA Pass 10 Comprehensive Fixes
-- Addresses C2 (shoulder contraindications), C3 (lower back + crunches),
-- M1 (equipment fixes), M6 (real prod slugs), M8 (upright row retags)
-- This migration is idempotent (safe to re-run)

-- ====================
-- Part 1: C2 - Shoulder contraindications for overhead, throw, and behind-neck moves
-- ====================

-- QA C2: Overhead throws load shoulders heavily and are contraindicated for shoulder injuries
UPDATE exercises
SET contraindicated_regions = 
  CASE 
    WHEN 'shoulder' = ANY(contraindicated_regions) THEN contraindicated_regions
    ELSE array_append(contraindicated_regions, 'shoulder'::body_region)
  END
WHERE slug IN (
  -- Medicine ball throws (REAL prod slugs from QA M6)
  'medicine-ball-scoop-throw',
  'catch-and-overhead-throw',
  'standing-two-arm-overhead-throw'
)
  AND NOT ('shoulder' = ANY(contraindicated_regions));

-- QA C2, H4: Bradford presses and behind-neck movements are shoulder contraindicated
UPDATE exercises
SET contraindicated_regions = 
  CASE 
    WHEN 'shoulder' = ANY(contraindicated_regions) THEN contraindicated_regions
    ELSE array_append(contraindicated_regions, 'shoulder'::body_region)
  END
WHERE slug IN (
  -- Bradford presses (REAL prod slugs from QA M6)
  'bradford-rocky-presses',
  'standing-bradford-press',
  -- Behind-neck movements
  'behind-the-neck-press',
  'behind-the-neck-pulldown',
  'behind-neck-barbell-overhead-press'
)
  AND NOT ('shoulder' = ANY(contraindicated_regions));

-- QA H4, M6: Low pulley row to neck is contraindicated for shoulder
UPDATE exercises
SET contraindicated_regions = 
  CASE 
    WHEN 'shoulder' = ANY(contraindicated_regions) THEN contraindicated_regions
    ELSE array_append(contraindicated_regions, 'shoulder'::body_region)
  END
WHERE slug = 'low-pulley-row-to-neck'
  AND NOT ('shoulder' = ANY(contraindicated_regions));

-- QA C2: Olympic lifts with overhead catch load shoulders
UPDATE exercises
SET contraindicated_regions = 
  CASE 
    WHEN 'shoulder' = ANY(contraindicated_regions) THEN contraindicated_regions
    ELSE array_append(contraindicated_regions, 'shoulder'::body_region)
  END
WHERE slug IN (
  -- Snatches (REAL prod slugs from QA M6)
  'one-arm-kettlebell-snatch',
  'double-kettlebell-snatch',
  'one-arm-kettlebell-split-snatch',
  -- Clean and jerk variations (REAL prod slugs)
  'clean-and-press',
  'two-arm-kettlebell-clean',
  'double-kettlebell-jerk',
  'one-arm-kettlebell-jerk',
  'two-arm-kettlebell-jerk',
  'one-arm-kettlebell-split-jerk',
  'one-arm-kettlebell-clean-and-jerk'
)
  AND NOT ('shoulder' = ANY(contraindicated_regions));

-- QA M6: Bent-arm pullovers use REAL prod slugs
UPDATE exercises
SET contraindicated_regions = 
  CASE 
    WHEN 'shoulder' = ANY(contraindicated_regions) THEN contraindicated_regions
    ELSE array_append(contraindicated_regions, 'shoulder'::body_region)
  END
WHERE slug IN (
  'bent-arm-dumbbell-pullover',
  'bent-arm-barbell-pullover',
  'straight-arm-dumbbell-pullover',
  'front-raise-and-pullover',
  'wide-grip-decline-barbell-pullover'
)
  AND NOT ('shoulder' = ANY(contraindicated_regions));

-- QA M6: Shoulder presses (REAL prod slugs)
UPDATE exercises
SET contraindicated_regions = 
  CASE 
    WHEN 'shoulder' = ANY(contraindicated_regions) THEN contraindicated_regions
    ELSE array_append(contraindicated_regions, 'shoulder'::body_region)
  END
WHERE slug IN (
  'dumbbell-shoulder-press',
  'barbell-shoulder-press'
)
  AND NOT ('shoulder' = ANY(contraindicated_regions));

-- ====================
-- Part 2: C3 - Lower back contraindications for crunches and high spinal load
-- ====================

-- QA C3: All crunch variants load lower back through repeated spinal flexion
UPDATE exercises
SET contraindicated_regions = 
  CASE 
    WHEN 'lower_back' = ANY(contraindicated_regions) THEN contraindicated_regions
    ELSE array_append(contraindicated_regions, 'lower_back'::body_region)
  END
WHERE slug IN (
  -- Untagged crunch variants found by QA (REAL prod slugs from M6)
  'crunches',
  'cross-body-crunch',
  'rope-crunch',
  'cable-crunch',
  'standing-rope-crunch',
  'tuck-crunch',
  'reverse-crunch',
  'oblique-crunches',
  -- Side jackknife also loads lower back
  'side-jackknife'
)
  AND NOT ('lower_back' = ANY(contraindicated_regions));

-- ====================
-- Part 3: M1 - Equipment fixes
-- ====================

-- QA M1: table-row needs NO dumbbell (revert 110200 change)
-- Restore table-row to empty equipment (bodyweight exercise using a table for support)
UPDATE exercises
SET equipment_ids = ARRAY[]::text[]
WHERE slug = 'table-row'
  AND 'dumbbell' = ANY(equipment_ids);

-- QA M1: goblet-squat should allow dumbbell OR kettlebell
-- Add dumbbell to equipment if not already present
UPDATE exercises
SET equipment_ids = 
  CASE 
    WHEN 'dumbbell' = ANY(equipment_ids) THEN equipment_ids
    ELSE array_append(equipment_ids, 'dumbbell')
  END
WHERE slug = 'goblet-squat'
  AND NOT ('dumbbell' = ANY(equipment_ids));

-- ====================
-- Part 4: M8 - Retag upright rows (they are NOT horizontal pulls)
-- ====================

-- QA M8: Upright rows are vertical pulls (deltoid-dominant), not horizontal rows
-- They target side delts primarily, similar to lateral raises
UPDATE exercises
SET movement_pattern = 'vertical_pull',
    primary_muscles = ARRAY['side_delts']::muscle[],
    secondary_muscles = 
      CASE
        WHEN 'traps' = ANY(secondary_muscles) THEN secondary_muscles
        ELSE array_append(secondary_muscles, 'traps'::muscle)
      END
WHERE slug IN (
  'smith-machine-upright-row',
  'dumbbell-upright-row',
  'band-upright-row'
)
  AND movement_pattern = 'horizontal_pull';

-- ====================
-- Part 5: H3 - Retag mis-classified vertical_press exercises
-- ====================

-- QA H3: These are isolation shoulder accessories, NOT compound vertical_press
UPDATE exercises
SET movement_pattern = 'lateral_delt',
    mechanic = 'isolation'
WHERE slug IN (
  'cable-internal-rotation',
  'external-rotation-with-band',
  'dumbbell-raise',
  'barbell-incline-shoulder-raise',
  'kettlebell-pirate-ships'
)
  AND movement_pattern = 'vertical_press';

-- Front raises should be front_delt (shoulder isolation), not vertical_press
UPDATE exercises
SET movement_pattern = 'front_delt',
    mechanic = 'isolation'
WHERE slug IN (
  'dumbbell-front-raise',
  'barbell-front-raise',
  'cable-front-raise'
)
  AND movement_pattern = 'vertical_press';
