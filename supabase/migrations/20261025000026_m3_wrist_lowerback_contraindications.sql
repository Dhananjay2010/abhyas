-- M3: Add wrist contraindication tags to pike push-ups, dips, and front-rack exercises
-- Add lower_back contraindication tags to loaded exercises with high spinal load
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

-- Jefferson squats: unilateral loaded hinge with high spinal load (barbell between legs)
-- Already tagged knee; missing lower_back despite spinal_load = 'high'
UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'lower_back'::body_region)
WHERE slug = 'jefferson-squats'
  AND spinal_load = 'high'
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

  -- Verify wrist tags on front squats
  SELECT COUNT(*) INTO missing_count
  FROM exercises
  WHERE slug IN ('front-barbell-squat', 'front-barbell-squat-to-a-bench')
    AND NOT ('wrist'::body_region = ANY(contraindicated_regions));
  
  IF missing_count > 0 THEN
    RAISE WARNING 'Front-rack squats still missing wrist tags: % exercises', missing_count;
  END IF;

  -- Verify lower_back tags on Jefferson squats
  SELECT COUNT(*) INTO missing_count
  FROM exercises
  WHERE slug = 'jefferson-squats'
    AND spinal_load = 'high'
    AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));
  
  IF missing_count > 0 THEN
    RAISE WARNING 'Jefferson squats still missing lower_back tag: % exercises', missing_count;
  END IF;
END $$;
