-- Retag kettlebell-thruster with knee contraindication
-- Idempotent: append 'knee' only if it's absent

UPDATE exercises
SET contraindicated_regions = array_append(contraindicated_regions, 'knee'::body_region)
WHERE slug = 'kettlebell-thruster'
  AND NOT ('knee'::body_region = ANY(contraindicated_regions));
