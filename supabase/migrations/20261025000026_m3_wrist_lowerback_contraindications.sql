-- M3: Wrist and lower_back contraindication tags
-- IDEMPOTENT, INDEPENDENT of >=20261025000019

-- Wrist: pike push-ups
UPDATE exercises SET contraindicated_regions = array_append(contraindicated_regions, 'wrist'::body_region)
WHERE slug IN ('pike-push-up', 'elevated-pike-push-up')
  AND NOT ('wrist'::body_region = ANY(contraindicated_regions));

-- Wrist: dips  
UPDATE exercises SET contraindicated_regions = array_append(contraindicated_regions, 'wrist'::body_region)
WHERE slug IN ('dips-triceps-version', 'bench-dips', 'dip-machine')
  AND NOT ('wrist'::body_region = ANY(contraindicated_regions));

-- Wrist: front-rack
UPDATE exercises SET contraindicated_regions = array_append(contraindicated_regions, 'wrist'::body_region)
WHERE slug IN ('front-barbell-squat', 'front-barbell-squat-to-a-bench')
  AND NOT ('wrist'::body_region = ANY(contraindicated_regions));

-- Wrist: planks/crawls, rack positions, jerks, TGU
UPDATE exercises SET contraindicated_regions = array_append(contraindicated_regions, 'wrist'::body_region)
WHERE slug IN (
  'spider-crawl', 'alternating-renegade-row', 'squat-jerk',
  'double-kettlebell-jerk', 'one-arm-kettlebell-jerk', 'one-arm-kettlebell-split-jerk', 
  'two-arm-kettlebell-jerk', 'kettlebell-thruster',
  'kettlebell-turkish-get-up-lunge-style', 'kettlebell-turkish-get-up-squat-style'
)
  AND NOT ('wrist'::body_region = ANY(contraindicated_regions));

-- Lower back: bent-over rows (including one-arm-kettlebell-row sibling)
UPDATE exercises SET contraindicated_regions = array_append(contraindicated_regions, 'lower_back'::body_region)
WHERE slug IN (
  'one-arm-long-bar-row', 't-bar-row-with-handle', 'barbell-rear-delt-row',
  'alternating-kettlebell-row', 'two-arm-kettlebell-row', 'one-arm-kettlebell-row'
)
  AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));

-- Lower back: windmills, swings
UPDATE exercises SET contraindicated_regions = array_append(contraindicated_regions, 'lower_back'::body_region)
WHERE slug IN (
  'kettlebell-windmill', 'advanced-kettlebell-windmill', 'double-kettlebell-windmill',
  'one-arm-kettlebell-swings', 'vertical-swing'
)
  AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));

-- Lower back: loaded rotation (including cable-russian-twists and standing-cable-wood-chop siblings)
UPDATE exercises SET contraindicated_regions = array_append(contraindicated_regions, 'lower_back'::body_region)
WHERE slug IN (
  'russian-twist', 'seated-barbell-twist',
  'cable-russian-twists', 'standing-cable-wood-chop'
)
  AND NOT ('lower_back'::body_region = ANY(contraindicated_regions));

-- Verification: RAISE EXCEPTION if any target missing
DO $$
DECLARE
  wrist_slugs TEXT[] := ARRAY[
    'pike-push-up', 'elevated-pike-push-up', 'dips-triceps-version', 'bench-dips', 'dip-machine',
    'front-barbell-squat', 'front-barbell-squat-to-a-bench',
    'spider-crawl', 'alternating-renegade-row', 'squat-jerk',
    'double-kettlebell-jerk', 'one-arm-kettlebell-jerk', 'one-arm-kettlebell-split-jerk',
    'two-arm-kettlebell-jerk', 'kettlebell-thruster',
    'kettlebell-turkish-get-up-lunge-style', 'kettlebell-turkish-get-up-squat-style'
  ];
  lb_slugs TEXT[] := ARRAY[
    'one-arm-long-bar-row', 't-bar-row-with-handle', 'barbell-rear-delt-row',
    'alternating-kettlebell-row', 'two-arm-kettlebell-row', 'one-arm-kettlebell-row',
    'kettlebell-windmill', 'advanced-kettlebell-windmill', 'double-kettlebell-windmill',
    'one-arm-kettlebell-swings', 'vertical-swing',
    'russian-twist', 'seated-barbell-twist', 'cable-russian-twists', 'standing-cable-wood-chop'
  ];
  missing TEXT[];
  target_slug TEXT;
BEGIN
  FOREACH target_slug IN ARRAY wrist_slugs LOOP
    IF NOT EXISTS (SELECT 1 FROM exercises e WHERE e.slug = target_slug) THEN
      missing := array_append(missing, target_slug);
    END IF;
  END LOOP;
  
  FOREACH target_slug IN ARRAY lb_slugs LOOP
    IF NOT EXISTS (SELECT 1 FROM exercises e WHERE e.slug = target_slug) THEN
      missing := array_append(missing, target_slug);
    END IF;
  END LOOP;
  
  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'Migration 20261025000026: Missing exercises: %', array_to_string(missing, ', ');
  END IF;
END $$;
