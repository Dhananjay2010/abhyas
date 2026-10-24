-- QA Pass 10 Item 14: Romanian deadlift moderate spinal load for 50+ users
-- RDL is a loaded hinge with controlled ROM, suitable for older lifters when programmed appropriately

UPDATE exercises
SET spinal_load = 'moderate'
WHERE slug = 'romanian-deadlift'
  AND spinal_load = 'high';
