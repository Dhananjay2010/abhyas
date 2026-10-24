-- QA Pass 10 Item 14: Romanian deadlift with managed spinal load for 50+ users
-- RDL is a loaded hinge with controlled ROM, suitable for older lifters when programmed appropriately
-- Changing from 'high' to 'low' as it's more manageable than conventional deadlifts

UPDATE exercises
SET spinal_load = 'low'
WHERE slug = 'romanian-deadlift'
  AND spinal_load = 'high';
