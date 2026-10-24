-- Catalogue Descriptions Correctness Fixes
-- This migration is idempotent (safe to re-run)
-- Fixes exercises where the cue contradicts the movement pattern
--
-- Excludes exercises with pattern tags that appear wrong (listed in PR body):
--   catch-and-overhead-throw, straight-arm-dumbbell-pullover,
--   double-kettlebell-snatch, one-arm-kettlebell-snatch, one-arm-kettlebell-split-snatch,
--   two-arm-kettlebell-clean, external-rotation, band-assisted-external-rotation,
--   cable-external-rotation, cable-internal-rotation, butterfly, dumbbell-raise,
--   front-raise-and-pullover, wide-grip-decline-barbell-pullover, standing-two-arm-overhead-throw

-- ============================================================================
-- Part 1: Impact Level Fix
-- ============================================================================

UPDATE exercises SET impact = 'low'
WHERE slug = 'isometric-chest-squeezes' AND impact = 'high';

-- ============================================================================
-- Part 2: Lower-Body Exercise Description Fixes
-- ============================================================================
-- Squat, lunge, hinge, calf exercises should not be described as 'push movement' or 'pull movement'

-- Barbell Squat - squat pattern, compound
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Alternating Hang Clean - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting front delts, side delts. Kettlebell.'
WHERE slug = 'alternating-hang-clean' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Band Good Morning - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting hamstrings. Bands.'
WHERE slug = 'band-good-morning' AND cue = 'Compound pull movement targeting hamstrings. Bands.';

-- Barbell Deadlift - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting quads. Barbell, Rack.'
WHERE slug = 'barbell-deadlift' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Glute Bridge - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting chest. Barbell, Bench.'
WHERE slug = 'barbell-glute-bridge' AND cue = 'Compound push movement targeting chest. Barbell, Bench.';

-- Barbell Hack Squat - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting glutes. Barbell.'
WHERE slug = 'barbell-hack-squat' AND cue = 'Compound push movement targeting glutes. Barbell.';

-- Barbell Lunge - lunge pattern, compound
UPDATE exercises SET cue = 'Compound Lunge movement targeting rear delts. Barbell.'
WHERE slug = 'barbell-lunge' AND cue = 'Compound pull movement targeting rear delts. Barbell.';

-- Barbell Side Split Squat - lunge pattern, compound
UPDATE exercises SET cue = 'Compound Lunge movement targeting quads. Barbell, Rack.'
WHERE slug = 'barbell-side-split-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Squat To A Bench - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting quads. Barbell.'
WHERE slug = 'barbell-squat-to-a-bench' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Barbell Walking Lunge - lunge pattern, compound
UPDATE exercises SET cue = 'Compound Lunge movement targeting triceps. Dip bars, Bench.'
WHERE slug = 'barbell-walking-lunge' AND cue = 'Compound push movement targeting triceps. Dip bars, Bench.';

-- Bench Jump - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting triceps. Barbell, Bench.'
WHERE slug = 'bench-jump' AND cue = 'Compound push movement targeting triceps. Barbell, Bench.';

-- Box Squat with Bands - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'box-squat-with-bands' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Butt Lift (Bridge) - hinge pattern, isolation
UPDATE exercises SET cue = 'Isolation Hinge movement targeting chest. Machine.'
WHERE slug = 'butt-lift-bridge' AND cue = 'Isolation pull movement targeting chest. Machine.';

-- Calf Press On The Leg Press Machine - calf pattern, isolation
UPDATE exercises SET cue = 'Isolation Calf movement targeting calves. Dumbbells.'
WHERE slug = 'calf-press-on-the-leg-press-machine' AND cue = 'Isolation push movement targeting calves. Dumbbells.';

-- Calf Raises - With Bands - calf pattern, isolation
UPDATE exercises SET cue = 'Isolation Calf movement targeting front delts, side delts. Barbell.'
WHERE slug = 'calf-raises-with-bands' AND cue = 'Isolation push movement targeting front delts, side delts. Barbell.';

-- Deadlift with Chains - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting chest. Bench, Barbell.'
WHERE slug = 'deadlift-with-chains' AND cue = 'Compound push movement targeting chest. Bench, Barbell.';

-- Double Kettlebell Alternating Hang Clean - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting front delts, side delts. Kettlebell.'
WHERE slug = 'double-kettlebell-alternating-hang-clean' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Downward Facing Balance - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting biceps. Barbell.'
WHERE slug = 'downward-facing-balance' AND cue = 'Compound pull movement targeting biceps. Barbell.';

-- Dumbbell Clean - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting triceps. Dumbbells.'
WHERE slug = 'dumbbell-clean' AND cue = 'Compound push movement targeting triceps. Dumbbells.';

-- Dumbbell Seated One-Leg Calf Raise - calf pattern, compound
UPDATE exercises SET cue = 'Compound Calf movement targeting front delts, side delts. Dumbbells.'
WHERE slug = 'dumbbell-seated-one-leg-calf-raise' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Dumbbell Squat - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting quads. Dumbbells, Bench.'
WHERE slug = 'dumbbell-squat' AND cue = 'Compound push movement targeting quads. Dumbbells, Bench.';

-- Dumbbell Step Ups - lunge pattern, isolation
UPDATE exercises SET cue = 'Isolation Lunge movement targeting triceps. Dumbbells.'
WHERE slug = 'dumbbell-step-ups' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Flutter Kicks - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting quads.'
WHERE slug = 'flutter-kicks' AND cue = 'Compound push movement targeting quads.';

-- Front Barbell Squat To A Bench - squat pattern, isolation
UPDATE exercises SET cue = 'Isolation Squat movement targeting front delts, side delts. Cable machine.'
WHERE slug = 'front-barbell-squat-to-a-bench' AND cue = 'Isolation push movement targeting front delts, side delts. Cable machine.';

-- Front Squats With Two Kettlebells - squat pattern, isolation
UPDATE exercises SET cue = 'Isolation Squat movement targeting front delts, side delts. Dumbbells.'
WHERE slug = 'front-squats-with-two-kettlebells' AND cue = 'Isolation push movement targeting front delts, side delts. Dumbbells.';

-- Glute Kickback - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting quads. Kettlebell.'
WHERE slug = 'glute-kickback' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- Good Morning - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting hamstrings. Barbell, Rack.'
WHERE slug = 'good-morning' AND cue = 'Compound push movement targeting hamstrings. Barbell, Rack.';

-- Hip Flexion with Band - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting glutes. Bands.'
WHERE slug = 'hip-flexion-with-band' AND cue = 'Compound push movement targeting glutes. Bands.';

-- Hyperextensions With No Hyperextension Bench - hinge pattern, isolation
UPDATE exercises SET cue = 'Isolation Hinge movement targeting triceps. Bench, Barbell.'
WHERE slug = 'hyperextensions-with-no-hyperextension-bench' AND cue = 'Isolation push movement targeting triceps. Bench, Barbell.';

-- Jefferson Squats - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting front delts, side delts. Kettlebell.'
WHERE slug = 'jefferson-squats' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Kettlebell One-Legged Deadlift - hinge pattern, isolation
UPDATE exercises SET cue = 'Isolation Hinge movement targeting triceps. Kettlebell.'
WHERE slug = 'kettlebell-one-legged-deadlift' AND cue = 'Isolation push movement targeting triceps. Kettlebell.';

-- Kettlebell Pistol Squat - lunge pattern, compound
UPDATE exercises SET cue = 'Compound Lunge movement targeting front delts, side delts. Kettlebell.'
WHERE slug = 'kettlebell-pistol-squat' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Kettlebell Turkish Get-Up (Squat style) - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting abs. Kettlebell.'
WHERE slug = 'kettlebell-turkish-get-up-squat-style' AND cue = 'Compound pull movement targeting abs. Kettlebell.';

-- Knee Tuck Jump - hinge pattern, isolation
UPDATE exercises SET cue = 'Isolation Hinge movement targeting abs. Cable machine.'
WHERE slug = 'knee-tuck-jump' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Leg Extensions - squat pattern, isolation
UPDATE exercises SET cue = 'Isolation Squat movement targeting glutes.'
WHERE slug = 'leg-extensions' AND cue = 'Isolation push movement targeting glutes.';

-- Leg Press - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting abs.'
WHERE slug = 'leg-press' AND cue = 'Compound pull movement targeting abs.';

-- Lunge Sprint - lunge pattern, isolation
UPDATE exercises SET cue = 'Isolation Lunge movement targeting biceps. Cable machine, Bench.'
WHERE slug = 'lunge-sprint' AND cue = 'Isolation pull movement targeting biceps. Cable machine, Bench.';

-- Lying Leg Curls - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting quads. Bench, Machine.'
WHERE slug = 'lying-leg-curls' AND cue = 'Compound push movement targeting quads. Bench, Machine.';

-- Narrow Stance Leg Press - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting quads. Barbell.'
WHERE slug = 'narrow-stance-leg-press' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Natural Glute Ham Raise - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting chest. Barbell.'
WHERE slug = 'natural-glute-ham-raise' AND cue = 'Compound push movement targeting chest. Barbell.';

-- One-Arm Kettlebell Clean - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting front delts, side delts. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-clean' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- One-Arm Open Palm Kettlebell Clean - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting quads. Kettlebell.'
WHERE slug = 'one-arm-open-palm-kettlebell-clean' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- One-Arm Side Deadlift - hinge pattern, isolation
UPDATE exercises SET cue = 'Isolation Hinge movement targeting side delts. Dumbbells.'
WHERE slug = 'one-arm-side-deadlift' AND cue = 'Isolation push movement targeting side delts. Dumbbells.';

-- One-Legged Cable Kickback - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting chest. Dumbbells, Bench.'
WHERE slug = 'one-legged-cable-kickback' AND cue = 'Compound push movement targeting chest. Dumbbells, Bench.';

-- Open Palm Kettlebell Clean - hinge pattern, isolation
UPDATE exercises SET cue = 'Isolation Hinge movement targeting biceps. Cable machine.'
WHERE slug = 'open-palm-kettlebell-clean' AND cue = 'Isolation pull movement targeting biceps. Cable machine.';

-- Plie Dumbbell Squat - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting chest. Kettlebell.'
WHERE slug = 'plie-dumbbell-squat' AND cue = 'Compound push movement targeting chest. Kettlebell.';

-- Pull Through - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting lats. Pull-up bar.'
WHERE slug = 'pull-through' AND cue = 'Compound pull movement targeting lats. Pull-up bar.';

-- Rack Pulls - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting front delts, side delts. Medicine ball.'
WHERE slug = 'rack-pulls' AND cue = 'Compound push movement targeting front delts, side delts. Medicine ball.';

-- Reverse Band Deadlift - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting quads. Barbell, Rack.'
WHERE slug = 'reverse-band-deadlift' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Reverse Band Sumo Deadlift - hinge pattern, isolation
UPDATE exercises SET cue = 'Isolation Hinge movement targeting biceps. Barbell.'
WHERE slug = 'reverse-band-sumo-deadlift' AND cue = 'Isolation pull movement targeting biceps. Barbell.';

-- Rocking Standing Calf Raise - calf pattern, compound
UPDATE exercises SET cue = 'Compound Calf movement targeting hamstrings. Barbell.'
WHERE slug = 'rocking-standing-calf-raise' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Scissors Jump - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting front delts, side delts. Barbell.'
WHERE slug = 'scissors-jump' AND cue = 'Compound push movement targeting front delts, side delts. Barbell.';

-- Seated Calf Raise - calf pattern, isolation
UPDATE exercises SET cue = 'Isolation Calf movement targeting biceps. Barbell.'
WHERE slug = 'seated-calf-raise' AND cue = 'Isolation pull movement targeting biceps. Barbell.';

-- Seated Good Mornings - hinge pattern, isolation
UPDATE exercises SET cue = 'Isolation Hinge movement targeting hamstrings. Leg curl.'
WHERE slug = 'seated-good-mornings' AND cue = 'Isolation pull movement targeting hamstrings. Leg curl.';

-- Single Leg Glute Bridge - hinge pattern, isolation
UPDATE exercises SET cue = 'Isolation Hinge movement targeting abs.'
WHERE slug = 'single-leg-glute-bridge' AND cue = 'Isolation pull movement targeting abs.';

-- Smith Machine Calf Raise - calf pattern, compound
UPDATE exercises SET cue = 'Compound Calf movement targeting triceps. Bench, Smith machine.'
WHERE slug = 'smith-machine-calf-raise' AND cue = 'Compound push movement targeting triceps. Bench, Smith machine.';

-- Smith Machine Leg Press - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting side delts, traps. Smith machine.'
WHERE slug = 'smith-machine-leg-press' AND cue = 'Compound pull movement targeting side delts, traps. Smith machine.';

-- Smith Machine Reverse Calf Raises - calf pattern, compound
UPDATE exercises SET cue = 'Compound Calf movement targeting quads. Smith machine.'
WHERE slug = 'smith-machine-reverse-calf-raises' AND cue = 'Compound push movement targeting quads. Smith machine.';

-- Smith Machine Stiff-Legged Deadlift - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting traps. Smith machine.'
WHERE slug = 'smith-machine-stiff-legged-deadlift' AND cue = 'Compound pull movement targeting traps. Smith machine.';

-- Smith Single-Leg Split Squat - lunge pattern, compound
UPDATE exercises SET cue = 'Compound Lunge movement targeting hamstrings. Barbell.'
WHERE slug = 'smith-single-leg-split-squat' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Speed Squats - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting abs. Dumbbells.'
WHERE slug = 'speed-squats' AND cue = 'Compound pull movement targeting abs. Dumbbells.';

-- Split Jump - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting quads. Dumbbells.'
WHERE slug = 'split-jump' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Squat Jerk - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'squat-jerk' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squat with Chains - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'squat-with-chains' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squats - With Bands - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting front delts, side delts. Dumbbells.'
WHERE slug = 'squats-with-bands' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Standing Barbell Calf Raise - calf pattern, compound
UPDATE exercises SET cue = 'Compound Calf movement targeting front delts, side delts. Barbell.'
WHERE slug = 'standing-barbell-calf-raise' AND cue = 'Compound push movement targeting front delts, side delts. Barbell.';

-- Standing Long Jump - squat pattern, isolation
UPDATE exercises SET cue = 'Isolation Squat movement targeting front delts, side delts. Cable machine.'
WHERE slug = 'standing-long-jump' AND cue = 'Isolation push movement targeting front delts, side delts. Cable machine.';

-- Star Jump - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting glutes.'
WHERE slug = 'star-jump' AND cue = 'Compound push movement targeting glutes.';

-- Stiff-Legged Dumbbell Deadlift - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting lower back. Barbell, Rack.'
WHERE slug = 'stiff-legged-dumbbell-deadlift' AND cue = 'Compound push movement targeting lower back. Barbell, Rack.';

-- Sumo Deadlift - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'sumo-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Sumo Deadlift with Chains - hinge pattern, compound
UPDATE exercises SET cue = 'Compound Hinge movement targeting triceps. Medicine ball.'
WHERE slug = 'sumo-deadlift-with-chains' AND cue = 'Compound push movement targeting triceps. Medicine ball.';

-- Weighted Jump Squat - squat pattern, compound
UPDATE exercises SET cue = 'Compound Squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'weighted-jump-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Zercher Squats - squat pattern, isolation
UPDATE exercises SET cue = 'Isolation Squat movement targeting biceps. Dumbbells.'
WHERE slug = 'zercher-squats' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';
