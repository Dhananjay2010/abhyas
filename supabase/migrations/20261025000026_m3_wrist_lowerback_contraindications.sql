-- M3: Add wrist contraindication tags to pike push-ups, dips, front-rack exercises,
-- and loaded wrist positions. Add lower_back tags to unsupported rows, windmills, and loaded rotation.
-- 
-- IDEMPOTENT: Safe to run multiple times; uses conditional array append.
-- INDEPENDENT: Does not depend on migrations >= 20261025000019.

-- Pike push-up variants: bodyweight through extended wrist in vertical press position
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'wrist'::body_region)
WHERE slug IN ('pike-push-up', 'elevated-pike-push-up')
  AND NOT ('wrist'::body_region = ANY(contraindicated_regions));

-- Dips (triceps and bench variants): full bodyweight through extended wrist
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'wrist'::body_region)
WHERE slug IN ('dips-triceps-version', 'bench-dips')
  AND NOT ('wrist'::body_region = ANY(contraindicated_regions));

-- Front-rack barbell squats: barbell rests on anterior delts in front-rack position,
-- requiring significant wrist extension to hold the bar
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'wrist'::body_region)
WHERE slug IN ('front-barbell-squat', 'front-barbell-squat-to-a-bench')
  AND NOT ('wrist'::body_region = ANY(contraindicated_regions));

-- Additional wrist-loading exercises: plank positions, rack positions, posting hand
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'wrist'::body_region)
WHERE slug IN (
  'spider-crawl',                    -- hands on floor in plank
  'alternating-renegade-row',        -- plank on kettlebells
  'dip-machine',                     -- machine dips, wrist load
  'squat-jerk',                      -- front rack position
  'double-kettlebell-jerk',          -- rack position
  'one-arm-kettlebell-jerk',         -- rack position
  'one-arm-kettlebell-split-jerk',   -- rack position
  'two-arm-kettlebell-jerk',         -- rack position
  'kettlebell-thruster',             -- front rack to overhead
  'kettlebell-turkish-get-up-lunge-style',   -- posting hand
  'kettlebell-turkish-get-up-squat-style'    -- posting hand
)
  AND NOT ('wrist'::body_region = ANY(contraindicated_regions));

-- Jefferson squats: unilateral loaded hinge with high spinal load
-- (Note: already has spinal_load='high', which derives lower_back, but explicit tag for clarity)
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'lower_back'::body_region)
WHERE slug = 'jefferson-squats'
  AND spinal_load = 'high'
  AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));

-- Unsupported bent-over rows: loaded horizontal pull with unsupported torso
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'lower_back'::body_region)
WHERE slug IN (
  'one-arm-long-bar-row',
  't-bar-row-with-handle',
  'barbell-rear-delt-row',
  'alternating-kettlebell-row',
  'two-arm-kettlebell-row'
)
  AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));

-- Kettlebell windmills: loaded lateral flexion under load
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'lower_back'::body_region)
WHERE slug IN (
  'kettlebell-windmill',
  'advanced-kettlebell-windmill',
  'double-kettlebell-windmill'
)
  AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));

-- Kettlebell swings: ballistic hinge with hip drive
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'lower_back'::body_region)
WHERE slug IN (
  'one-arm-kettlebell-swings',
  'vertical-swing'
)
  AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));

-- Loaded spinal rotation: seated twists with weight
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'lower_back'::body_region)
WHERE slug IN (
  'russian-twist',
  'seated-barbell-twist'
)
  AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));

-- Verification: Check that all tagged exercises now have expected contraindications
DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  -- Verify wrist tags on pike push-ups
  SELECT COUNT(*) INTO missing_count
  FROM exercises
  WHERE slug IN ('pike-push-up', 'elevated-pike-push-up')
    AND NOT ('wrist'::body_region = ANY(contraindicated_regions));
  
  IF missing_count > 0 THEN
    RAISE WARNING 'Pike push-up variants still missing wrist tags: % exercises', missing_count;
  END IF;

  -- Verify wrist tags on dips
  SELECT COUNT(*) INTO missing_count
  FROM exercises
  WHERE slug IN ('dips-triceps-version', 'bench-dips')
    AND NOT ('wrist'::body_region = ANY(contraindicated_regions));
  
  IF missing_count > 0 THEN
    RAISE WARNING 'Dips still missing wrist tags: % exercises', missing_count;
  END IF;

  -- Verify wrist tags on front-rack squats
  SELECT COUNT(*) INTO missing_count
  FROM exercises
  WHERE slug IN ('front-barbell-squat', 'front-barbell-squat-to-a-bench')
    AND NOT ('wrist'::body_region = ANY(contraindicated_regions));
  
  IF missing_count > 0 THEN
    RAISE WARNING 'Front-rack squats still missing wrist tags: % exercises', missing_count;
  END IF;

  -- Verify wrist tags on additional exercises
  SELECT COUNT(*) INTO missing_count
  FROM exercises
  WHERE slug IN (
    'spider-crawl', 'alternating-renegade-row', 'dip-machine', 'squat-jerk',
    'double-kettlebell-jerk', 'one-arm-kettlebell-jerk', 'one-arm-kettlebell-split-jerk',
    'two-arm-kettlebell-jerk', 'kettlebell-thruster',
    'kettlebell-turkish-get-up-lunge-style', 'kettlebell-turkish-get-up-squat-style'
  )
    AND NOT ('wrist'::body_region = ANY(contraindicated_regions));
  
  IF missing_count > 0 THEN
    RAISE WARNING 'Additional wrist exercises still missing tags: % exercises', missing_count;
  END IF;

  -- Verify lower_back tags on rows
  SELECT COUNT(*) INTO missing_count
  FROM exercises
  WHERE slug IN (
    'one-arm-long-bar-row', 't-bar-row-with-handle', 'barbell-rear-delt-row',
    'alternating-kettlebell-row', 'two-arm-kettlebell-row'
  )
    AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));
  
  IF missing_count > 0 THEN
    RAISE WARNING 'Unsupported rows still missing lower_back tags: % exercises', missing_count;
  END IF;

  -- Verify lower_back tags on windmills
  SELECT COUNT(*) INTO missing_count
  FROM exercises
  WHERE slug IN ('kettlebell-windmill', 'advanced-kettlebell-windmill', 'double-kettlebell-windmill')
    AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));
  
  IF missing_count > 0 THEN
    RAISE WARNING 'Windmills still missing lower_back tags: % exercises', missing_count;
  END IF;

  -- Verify lower_back tags on swings
  SELECT COUNT(*) INTO missing_count
  FROM exercises
  WHERE slug IN ('one-arm-kettlebell-swings', 'vertical-swing')
    AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));
  
  IF missing_count > 0 THEN
    RAISE WARNING 'Swings still missing lower_back tags: % exercises', missing_count;
  END IF;

  -- Verify lower_back tags on twists
  SELECT COUNT(*) INTO missing_count
  FROM exercises
  WHERE slug IN ('russian-twist', 'seated-barbell-twist')
    AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));
  
  IF missing_count > 0 THEN
    RAISE WARNING 'Twists still missing lower_back tags: % exercises', missing_count;
  END IF;
END $$;
