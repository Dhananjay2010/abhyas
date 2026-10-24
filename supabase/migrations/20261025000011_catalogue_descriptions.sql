-- Catalogue Descriptions Correctness Fixes
-- This migration is idempotent (safe to re-run)

-- ============================================================================
-- Part 1: Impact Level Fix
-- ============================================================================

UPDATE exercises SET impact = 'low'
WHERE slug = 'isometric-chest-squeezes' AND impact = 'high';

-- ============================================================================
-- Part 2: Warmup Type Fix
-- ============================================================================

UPDATE warmup_exercises SET type = 'mobility'
WHERE slug = 'cat-cow-stretch' AND type = 'stretch';

-- ============================================================================
-- Part 3: Spanish Squat Cue Enhancement
-- ============================================================================

UPDATE exercises SET cue = 'Anchor band to sturdy post or rack at knee height. Band behind knees creates forward resistance - controlled squat motion'
WHERE slug = 'spanish-squat' AND cue = 'Band behind knees creates forward resistance - controlled squat motion';

-- ============================================================================
-- Part 4: Lower-Body, Core, Cardio, and Other Exercise Description Fixes
-- ============================================================================

-- Barbell Full Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'barbell-full-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Hack Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'barbell-hack-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Squat To A Bench
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'barbell-squat-to-a-bench' AND cue = 'Compound push movement targeting quads. Barbell, Bench, Rack.';

-- Bench Jump
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'bench-jump' AND cue = 'Compound push movement targeting quads. Bench.';

-- Bodyweight Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'bodyweight-squat' AND cue = 'Compound push movement targeting quads.';

-- Box Squat with Bands
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'box-squat-with-bands' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Box Squat with Chains
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'box-squat-with-chains' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Cable Hip Adduction
UPDATE exercises SET cue = 'isolation squat movement targeting quads with Cable.'
WHERE slug = 'cable-hip-adduction' AND cue = 'Isolation pull movement targeting quads. Cable machine.';

-- Chair Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'chair-squat' AND cue = 'Compound push movement targeting quads. Machine.';

-- Dumbbell Seated Box Jump
UPDATE exercises SET cue = 'compound squat movement targeting quads with Dumbbell.'
WHERE slug = 'dumbbell-seated-box-jump' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Dumbbell.'
WHERE slug = 'dumbbell-squat' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Squat To A Bench
UPDATE exercises SET cue = 'compound squat movement targeting quads with Dumbbell.'
WHERE slug = 'dumbbell-squat-to-a-bench' AND cue = 'Compound push movement targeting quads. Dumbbells, Bench.';

-- Freehand Jump Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'freehand-jump-squat' AND cue = 'Compound push movement targeting quads.';

-- Front Barbell Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'front-barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Front Barbell Squat To A Bench
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'front-barbell-squat-to-a-bench' AND cue = 'Compound push movement targeting quads. Barbell, Bench, Rack.';

-- Front Squat (Clean Grip)
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'front-squat-clean-grip' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Front Squats With Two Kettlebells
UPDATE exercises SET cue = 'compound squat movement targeting quads with Kettlebell.'
WHERE slug = 'front-squats-with-two-kettlebells' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- Goblet Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Kettlebell.'
WHERE slug = 'goblet-squat' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- Hack Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'hack-squat' AND cue = 'Compound push movement targeting quads. Hack squat.';

-- Jefferson Squats
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'jefferson-squats' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Kettlebell Turkish Get-Up (Squat style)
UPDATE exercises SET cue = 'compound squat movement targeting front_delts, side_delts with Kettlebell.'
WHERE slug = 'kettlebell-turkish-get-up-squat-style' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Knee Tuck Jump
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'knee-tuck-jump' AND cue = 'Compound push movement targeting hamstrings.';

-- Kneeling Squat
UPDATE exercises SET cue = 'compound squat movement targeting glutes with Barbell.'
WHERE slug = 'kneeling-squat' AND cue = 'Compound push movement targeting glutes. Barbell, Rack.';

-- Leg Press
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'leg-press' AND cue = 'Compound push movement targeting quads. Leg press.';

-- Lying Machine Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'lying-machine-squat' AND cue = 'Compound push movement targeting quads. Bench, Machine.';

-- Narrow Stance Hack Squats
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'narrow-stance-hack-squats' AND cue = 'Compound push movement targeting quads. Hack squat.';

-- Narrow Stance Leg Press
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'narrow-stance-leg-press' AND cue = 'Compound push movement targeting quads. Leg press.';

-- Narrow Stance Squats
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'narrow-stance-squats' AND cue = 'Compound push movement targeting quads. Barbell.';

-- One-Arm Overhead Kettlebell Squats
UPDATE exercises SET cue = 'compound squat movement targeting quads with Kettlebell.'
WHERE slug = 'one-arm-overhead-kettlebell-squats' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- One Leg Barbell Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'one-leg-barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Plie Dumbbell Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Dumbbell.'
WHERE slug = 'plie-dumbbell-squat' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Reverse Band Box Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'reverse-band-box-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Reverse Band Power Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'reverse-band-power-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Rocket Jump
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'rocket-jump' AND cue = 'Compound push movement targeting quads.';

-- Scissors Jump
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'scissors-jump' AND cue = 'Compound push movement targeting quads.';

-- Smith Machine Leg Press
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'smith-machine-leg-press' AND cue = 'Compound push movement targeting quads. Leg press.';

-- Smith Machine Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Smith Machine.'
WHERE slug = 'smith-machine-squat' AND cue = 'Compound push movement targeting quads. Smith machine.';

-- Speed Box Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'speed-box-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Speed Squats
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'speed-squats' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Split Jump
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'split-jump' AND cue = 'Compound push movement targeting quads.';

-- Squat Jerk
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'squat-jerk' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squat with Bands
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'squat-with-bands' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squat with Chains
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'squat-with-chains' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squat with Plate Movers
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'squat-with-plate-movers' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squats - With Bands
UPDATE exercises SET cue = 'compound squat movement targeting quads with Bands.'
WHERE slug = 'squats-with-bands' AND cue = 'Compound push movement targeting quads. Bands.';

-- Standing Long Jump
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'standing-long-jump' AND cue = 'Compound push movement targeting quads.';

-- Star Jump
UPDATE exercises SET cue = 'compound squat movement targeting quads.'
WHERE slug = 'star-jump' AND cue = 'Compound push movement targeting quads.';

-- Weighted Jump Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'weighted-jump-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Weighted Sissy Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'weighted-sissy-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Wide Stance Barbell Squat
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'wide-stance-barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Zercher Squats
UPDATE exercises SET cue = 'compound squat movement targeting quads with Barbell.'
WHERE slug = 'zercher-squats' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Barbell Lunge
UPDATE exercises SET cue = 'compound lunge movement targeting quads with Barbell.'
WHERE slug = 'barbell-lunge' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Barbell Side Split Squat
UPDATE exercises SET cue = 'compound lunge movement targeting quads with Barbell.'
WHERE slug = 'barbell-side-split-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Step Ups
UPDATE exercises SET cue = 'compound lunge movement targeting quads with Barbell.'
WHERE slug = 'barbell-step-ups' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Barbell Walking Lunge
UPDATE exercises SET cue = 'compound lunge movement targeting quads with Barbell.'
WHERE slug = 'barbell-walking-lunge' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Dumbbell Lunges
UPDATE exercises SET cue = 'compound lunge movement targeting quads with Dumbbell.'
WHERE slug = 'dumbbell-lunges' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Rear Lunge
UPDATE exercises SET cue = 'compound lunge movement targeting quads with Dumbbell.'
WHERE slug = 'dumbbell-rear-lunge' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Step Ups
UPDATE exercises SET cue = 'compound lunge movement targeting quads with Dumbbell.'
WHERE slug = 'dumbbell-step-ups' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Elevated Back Lunge
UPDATE exercises SET cue = 'compound lunge movement targeting quads with Barbell.'
WHERE slug = 'elevated-back-lunge' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Kettlebell Pistol Squat
UPDATE exercises SET cue = 'compound lunge movement targeting quads with Kettlebell.'
WHERE slug = 'kettlebell-pistol-squat' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- Kettlebell Turkish Get-Up (Lunge style)
UPDATE exercises SET cue = 'compound lunge movement targeting front_delts, side_delts with Kettlebell.'
WHERE slug = 'kettlebell-turkish-get-up-lunge-style' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Lunge Pass Through
UPDATE exercises SET cue = 'compound lunge movement targeting hamstrings with Kettlebell.'
WHERE slug = 'lunge-pass-through' AND cue = 'Compound push movement targeting hamstrings. Kettlebell.';

-- Lunge Sprint
UPDATE exercises SET cue = 'compound lunge movement targeting quads.'
WHERE slug = 'lunge-sprint' AND cue = 'Compound push movement targeting quads. Machine.';

-- Smith Machine Pistol Squat
UPDATE exercises SET cue = 'compound lunge movement targeting quads with Smith Machine.'
WHERE slug = 'smith-machine-pistol-squat' AND cue = 'Compound push movement targeting quads. Smith machine.';

-- Smith Single-Leg Split Squat
UPDATE exercises SET cue = 'compound lunge movement targeting quads with Smith Machine.'
WHERE slug = 'smith-single-leg-split-squat' AND cue = 'Compound push movement targeting quads. Smith machine.';

-- Split Squat with Dumbbells
UPDATE exercises SET cue = 'compound lunge movement targeting quads with Dumbbell.'
WHERE slug = 'split-squat-with-dumbbells' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Step-up with Knee Raise
UPDATE exercises SET cue = 'compound lunge movement targeting glutes.'
WHERE slug = 'step-up-with-knee-raise' AND cue = 'Compound push movement targeting glutes.';

-- Alternating Hang Clean
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Kettlebell.'
WHERE slug = 'alternating-hang-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Ball Leg Curl
UPDATE exercises SET cue = 'isolation hinge movement targeting hamstrings with Stability Ball.'
WHERE slug = 'ball-leg-curl' AND cue = 'Isolation pull movement targeting hamstrings. Stability ball.';

-- Band Good Morning
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Bands.'
WHERE slug = 'band-good-morning' AND cue = 'Compound pull movement targeting hamstrings. Bands.';

-- Band Good Morning (Pull Through)
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Bands.'
WHERE slug = 'band-good-morning-pull-through' AND cue = 'Compound pull movement targeting hamstrings. Bands.';

-- Barbell Deadlift
UPDATE exercises SET cue = 'compound hinge movement targeting lower back with Barbell.'
WHERE slug = 'barbell-deadlift' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Barbell Glute Bridge
UPDATE exercises SET cue = 'compound hinge movement targeting glutes with Barbell.'
WHERE slug = 'barbell-glute-bridge' AND cue = 'Compound push movement targeting glutes. Barbell.';

-- Barbell Hip Thrust
UPDATE exercises SET cue = 'compound hinge movement targeting glutes with Barbell.'
WHERE slug = 'barbell-hip-thrust' AND cue = 'Compound push movement targeting glutes. Barbell.';

-- Butt Lift (Bridge)
UPDATE exercises SET cue = 'compound hinge movement targeting glutes.'
WHERE slug = 'butt-lift-bridge' AND cue = 'Isolation push movement targeting glutes.';

-- Cable Deadlifts
UPDATE exercises SET cue = 'compound hinge movement targeting quads with Cable.'
WHERE slug = 'cable-deadlifts' AND cue = 'Compound pull movement targeting quads. Cable machine.';

-- Deadlift with Bands
UPDATE exercises SET cue = 'compound hinge movement targeting lower back with Barbell.'
WHERE slug = 'deadlift-with-bands' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Deadlift with Chains
UPDATE exercises SET cue = 'compound hinge movement targeting lower back with Barbell.'
WHERE slug = 'deadlift-with-chains' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Deficit Deadlift
UPDATE exercises SET cue = 'compound hinge movement targeting lower back with Barbell.'
WHERE slug = 'deficit-deadlift' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Double Kettlebell Alternating Hang Clean
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Kettlebell.'
WHERE slug = 'double-kettlebell-alternating-hang-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Dumbbell Clean
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Dumbbell.'
WHERE slug = 'dumbbell-clean' AND cue = 'Compound pull movement targeting hamstrings. Dumbbells.';

-- Glute Ham Raise
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings.'
WHERE slug = 'glute-ham-raise' AND cue = 'Compound pull movement targeting hamstrings. Machine.';

-- Good Morning
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Barbell.'
WHERE slug = 'good-morning' AND cue = 'Compound push movement targeting hamstrings. Barbell, Rack.';

-- Good Morning off Pins
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Barbell.'
WHERE slug = 'good-morning-off-pins' AND cue = 'Compound push movement targeting hamstrings. Barbell, Rack.';

-- Hanging Bar Good Morning
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Barbell.'
WHERE slug = 'hanging-bar-good-morning' AND cue = 'Compound push movement targeting hamstrings. Barbell, Pull-up bar, Rack.';

-- Hip Extension with Bands
UPDATE exercises SET cue = 'compound hinge movement targeting glutes with Bands.'
WHERE slug = 'hip-extension-with-bands' AND cue = 'Compound push movement targeting glutes. Bands.';

-- Hip Lift with Band
UPDATE exercises SET cue = 'compound hinge movement targeting glutes with Bands.'
WHERE slug = 'hip-lift-with-band' AND cue = 'Compound push movement targeting glutes. Bands.';

-- Hyperextensions With No Hyperextension Bench
UPDATE exercises SET cue = 'compound hinge movement targeting lower back.'
WHERE slug = 'hyperextensions-with-no-hyperextension-bench' AND cue = 'Compound pull movement targeting lower back. Bench.';

-- Kettlebell Dead Clean
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Kettlebell.'
WHERE slug = 'kettlebell-dead-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Kettlebell Hang Clean
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Kettlebell.'
WHERE slug = 'kettlebell-hang-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Kettlebell One-Legged Deadlift
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Kettlebell.'
WHERE slug = 'kettlebell-one-legged-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Leg Lift
UPDATE exercises SET cue = 'isolation hinge movement targeting glutes.'
WHERE slug = 'leg-lift' AND cue = 'Isolation push movement targeting glutes.';

-- Leverage Deadlift
UPDATE exercises SET cue = 'compound hinge movement targeting quads.'
WHERE slug = 'leverage-deadlift' AND cue = 'Compound pull movement targeting quads. Machine.';

-- Lying Leg Curls
UPDATE exercises SET cue = 'isolation hinge movement targeting hamstrings.'
WHERE slug = 'lying-leg-curls' AND cue = 'Isolation pull movement targeting hamstrings. Bench, Leg curl.';

-- Natural Glute Ham Raise
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings.'
WHERE slug = 'natural-glute-ham-raise' AND cue = 'Compound pull movement targeting hamstrings.';

-- One-Arm Kettlebell Clean
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Kettlebell.'
WHERE slug = 'one-arm-kettlebell-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- One-Arm Kettlebell Swings
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Kettlebell.'
WHERE slug = 'one-arm-kettlebell-swings' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- One-Arm Open Palm Kettlebell Clean
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Kettlebell.'
WHERE slug = 'one-arm-open-palm-kettlebell-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- One-Arm Side Deadlift
UPDATE exercises SET cue = 'compound hinge movement targeting quads with Barbell.'
WHERE slug = 'one-arm-side-deadlift' AND cue = 'Compound pull movement targeting quads. Barbell.';

-- One-Legged Cable Kickback
UPDATE exercises SET cue = 'isolation hinge movement targeting glutes with Cable.'
WHERE slug = 'one-legged-cable-kickback' AND cue = 'Isolation push movement targeting glutes. Cable machine.';

-- Open Palm Kettlebell Clean
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Kettlebell.'
WHERE slug = 'open-palm-kettlebell-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Physioball Hip Bridge
UPDATE exercises SET cue = 'compound hinge movement targeting glutes with Stability Ball.'
WHERE slug = 'physioball-hip-bridge' AND cue = 'Compound push movement targeting glutes. Stability ball.';

-- Power Clean
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Barbell.'
WHERE slug = 'power-clean' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Pull Through
UPDATE exercises SET cue = 'compound hinge movement targeting glutes with Cable.'
WHERE slug = 'pull-through' AND cue = 'Compound pull movement targeting glutes. Cable machine.';

-- Rack Pull with Bands
UPDATE exercises SET cue = 'compound hinge movement targeting lower back with Barbell.'
WHERE slug = 'rack-pull-with-bands' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Rack Pulls
UPDATE exercises SET cue = 'compound hinge movement targeting lower back with Barbell.'
WHERE slug = 'rack-pulls' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Reverse Band Deadlift
UPDATE exercises SET cue = 'compound hinge movement targeting lower back with Barbell.'
WHERE slug = 'reverse-band-deadlift' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Reverse Band Sumo Deadlift
UPDATE exercises SET cue = 'compound hinge movement targeting glutes with Barbell.'
WHERE slug = 'reverse-band-sumo-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Reverse Hyperextension
UPDATE exercises SET cue = 'Hinge movement targeting hamstrings.'
WHERE slug = 'reverse-hyperextension' AND cue = 'pull movement targeting hamstrings. Machine.';

-- Romanian Deadlift
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Barbell.'
WHERE slug = 'romanian-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Seated Good Mornings
UPDATE exercises SET cue = 'compound hinge movement targeting lower back with Barbell.'
WHERE slug = 'seated-good-mornings' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Seated Leg Curl
UPDATE exercises SET cue = 'isolation hinge movement targeting hamstrings.'
WHERE slug = 'seated-leg-curl' AND cue = 'Isolation pull movement targeting hamstrings. Leg curl.';

-- Single Leg Glute Bridge
UPDATE exercises SET cue = 'isolation hinge movement targeting glutes.'
WHERE slug = 'single-leg-glute-bridge' AND cue = 'Isolation push movement targeting glutes.';

-- Smith Machine Hang Power Clean
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Smith Machine.'
WHERE slug = 'smith-machine-hang-power-clean' AND cue = 'Compound pull movement targeting hamstrings. Smith machine.';

-- Smith Machine Stiff-Legged Deadlift
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Smith Machine.'
WHERE slug = 'smith-machine-stiff-legged-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Smith machine.';

-- Snatch Pull
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Barbell.'
WHERE slug = 'snatch-pull' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Standing Leg Curl
UPDATE exercises SET cue = 'isolation hinge movement targeting hamstrings.'
WHERE slug = 'standing-leg-curl' AND cue = 'Isolation pull movement targeting hamstrings. Leg curl.';

-- Stiff Leg Barbell Good Morning
UPDATE exercises SET cue = 'compound hinge movement targeting lower back with Barbell.'
WHERE slug = 'stiff-leg-barbell-good-morning' AND cue = 'Compound push movement targeting lower back. Barbell, Rack.';

-- Stiff-Legged Barbell Deadlift
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Barbell.'
WHERE slug = 'stiff-legged-barbell-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Stiff-Legged Dumbbell Deadlift
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Dumbbell.'
WHERE slug = 'stiff-legged-dumbbell-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Dumbbells.';

-- Sumo Deadlift
UPDATE exercises SET cue = 'compound hinge movement targeting glutes with Barbell.'
WHERE slug = 'sumo-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Sumo Deadlift with Bands
UPDATE exercises SET cue = 'compound hinge movement targeting glutes with Barbell.'
WHERE slug = 'sumo-deadlift-with-bands' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Sumo Deadlift with Chains
UPDATE exercises SET cue = 'compound hinge movement targeting glutes with Barbell.'
WHERE slug = 'sumo-deadlift-with-chains' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Vertical Swing
UPDATE exercises SET cue = 'compound hinge movement targeting hamstrings with Dumbbell.'
WHERE slug = 'vertical-swing' AND cue = 'Compound pull movement targeting hamstrings. Dumbbells.';

-- Weighted Ball Hyperextension
UPDATE exercises SET cue = 'compound hinge movement targeting lower back with Stability Ball.'
WHERE slug = 'weighted-ball-hyperextension' AND cue = 'Compound pull movement targeting lower back. Stability ball.';

-- Barbell Seated Calf Raise
UPDATE exercises SET cue = 'isolation calf movement targeting calves with Barbell.'
WHERE slug = 'barbell-seated-calf-raise' AND cue = 'Isolation push movement targeting calves. Barbell.';

-- Calf Press
UPDATE exercises SET cue = 'isolation calf movement targeting calves.'
WHERE slug = 'calf-press' AND cue = 'Isolation push movement targeting calves. Machine.';

-- Calf Press On The Leg Press Machine
UPDATE exercises SET cue = 'isolation calf movement targeting calves.'
WHERE slug = 'calf-press-on-the-leg-press-machine' AND cue = 'Isolation push movement targeting calves. Leg press.';

-- Calf Raise On A Dumbbell
UPDATE exercises SET cue = 'isolation calf movement targeting calves with Dumbbell.'
WHERE slug = 'calf-raise-on-a-dumbbell' AND cue = 'Isolation push movement targeting calves. Dumbbells.';

-- Calf Raises - With Bands
UPDATE exercises SET cue = 'isolation calf movement targeting calves with Bands.'
WHERE slug = 'calf-raises-with-bands' AND cue = 'Isolation push movement targeting calves. Bands.';

-- Dumbbell Seated One-Leg Calf Raise
UPDATE exercises SET cue = 'isolation calf movement targeting calves with Dumbbell.'
WHERE slug = 'dumbbell-seated-one-leg-calf-raise' AND cue = 'Isolation push movement targeting calves. Dumbbells.';

-- Rocking Standing Calf Raise
UPDATE exercises SET cue = 'isolation calf movement targeting calves with Barbell.'
WHERE slug = 'rocking-standing-calf-raise' AND cue = 'Isolation push movement targeting calves. Barbell.';

-- Seated Calf Raise
UPDATE exercises SET cue = 'isolation calf movement targeting calves.'
WHERE slug = 'seated-calf-raise' AND cue = 'Isolation push movement targeting calves. Machine.';

-- Smith Machine Calf Raise
UPDATE exercises SET cue = 'isolation calf movement targeting calves with Smith Machine.'
WHERE slug = 'smith-machine-calf-raise' AND cue = 'Isolation push movement targeting calves. Smith machine.';

-- Smith Machine Reverse Calf Raises
UPDATE exercises SET cue = 'isolation calf movement targeting calves with Smith Machine.'
WHERE slug = 'smith-machine-reverse-calf-raises' AND cue = 'Isolation push movement targeting calves. Smith machine.';

-- Standing Barbell Calf Raise
UPDATE exercises SET cue = 'isolation calf movement targeting calves with Barbell.'
WHERE slug = 'standing-barbell-calf-raise' AND cue = 'Isolation push movement targeting calves. Barbell.';

-- Standing Calf Raises
UPDATE exercises SET cue = 'isolation calf movement targeting calves.'
WHERE slug = 'standing-calf-raises' AND cue = 'Isolation push movement targeting calves. Machine.';

-- Standing Dumbbell Calf Raise
UPDATE exercises SET cue = 'isolation calf movement targeting calves with Dumbbell.'
WHERE slug = 'standing-dumbbell-calf-raise' AND cue = 'Isolation push movement targeting calves. Dumbbells.';

-- 3/4 Sit-Up
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = '3-4-sit-up' AND cue = 'Compound pull movement targeting abs.';

-- Ab Crunch Machine
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'ab-crunch-machine' AND cue = 'Isolation pull movement targeting abs. Machine.';

-- Advanced Kettlebell Windmill
UPDATE exercises SET cue = 'isolation core movement targeting abs with Kettlebell.'
WHERE slug = 'advanced-kettlebell-windmill' AND cue = 'Isolation push movement targeting abs. Kettlebell.';

-- Alternate Heel Touchers
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'alternate-heel-touchers' AND cue = 'Isolation pull movement targeting abs.';

-- Barbell Ab Rollout
UPDATE exercises SET cue = 'compound core movement targeting abs with Barbell.'
WHERE slug = 'barbell-ab-rollout' AND cue = 'Compound pull movement targeting abs. Barbell.';

-- Barbell Ab Rollout - On Knees
UPDATE exercises SET cue = 'compound core movement targeting abs with Barbell.'
WHERE slug = 'barbell-ab-rollout-on-knees' AND cue = 'Compound pull movement targeting abs. Barbell.';

-- Barbell Rollout from Bench
UPDATE exercises SET cue = 'compound core movement targeting abs with Barbell.'
WHERE slug = 'barbell-rollout-from-bench' AND cue = 'Compound pull movement targeting abs. Barbell, Bench.';

-- Barbell Side Bend
UPDATE exercises SET cue = 'isolation core movement targeting abs with Barbell.'
WHERE slug = 'barbell-side-bend' AND cue = 'Isolation pull movement targeting abs. Barbell.';

-- Bent-Knee Hip Raise
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'bent-knee-hip-raise' AND cue = 'Compound pull movement targeting abs.';

-- Bent Press
UPDATE exercises SET cue = 'compound core movement targeting abs with Kettlebell.'
WHERE slug = 'bent-press' AND cue = 'Compound pull movement targeting abs. Kettlebell.';

-- Bosu Ball Cable Crunch With Side Bends
UPDATE exercises SET cue = 'isolation core movement targeting abs with Cable.'
WHERE slug = 'bosu-ball-cable-crunch-with-side-bends' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Bottoms Up
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'bottoms-up' AND cue = 'Compound pull movement targeting abs.';

-- Butt-Ups
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'butt-ups' AND cue = 'Compound pull movement targeting abs.';

-- Cable Crunch
UPDATE exercises SET cue = 'isolation core movement targeting abs with Cable.'
WHERE slug = 'cable-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Cable Judo Flip
UPDATE exercises SET cue = 'compound core movement targeting abs with Cable.'
WHERE slug = 'cable-judo-flip' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Cable Reverse Crunch
UPDATE exercises SET cue = 'isolation core movement targeting abs with Cable.'
WHERE slug = 'cable-reverse-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Cable Russian Twists
UPDATE exercises SET cue = 'compound core movement targeting abs with Cable.'
WHERE slug = 'cable-russian-twists' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Cable Seated Crunch
UPDATE exercises SET cue = 'isolation core movement targeting abs with Cable.'
WHERE slug = 'cable-seated-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Cocoons
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'cocoons' AND cue = 'Compound pull movement targeting abs.';

-- Cross-Body Crunch
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'cross-body-crunch' AND cue = 'Compound pull movement targeting abs.';

-- Crunch - Hands Overhead
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'crunch-hands-overhead' AND cue = 'Isolation pull movement targeting abs.';

-- Crunch - Legs On Exercise Ball
UPDATE exercises SET cue = 'isolation core movement targeting abs with Stability Ball.'
WHERE slug = 'crunch-legs-on-exercise-ball' AND cue = 'Isolation pull movement targeting abs.';

-- Crunches
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'crunches' AND cue = 'Isolation pull movement targeting abs.';

-- Dead Bug
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'dead-bug' AND cue = 'Compound pull movement targeting abs.';

-- Decline Crunch
UPDATE exercises SET cue = 'isolation core movement targeting abs with Bench.'
WHERE slug = 'decline-crunch' AND cue = 'Isolation pull movement targeting abs. Bench.';

-- Decline Oblique Crunch
UPDATE exercises SET cue = 'compound core movement targeting abs with Bench.'
WHERE slug = 'decline-oblique-crunch' AND cue = 'Compound pull movement targeting abs. Bench.';

-- Decline Reverse Crunch
UPDATE exercises SET cue = 'compound core movement targeting abs with Bench.'
WHERE slug = 'decline-reverse-crunch' AND cue = 'Compound pull movement targeting abs. Bench.';

-- Double Kettlebell Windmill
UPDATE exercises SET cue = 'Core movement targeting abs with Kettlebell.'
WHERE slug = 'double-kettlebell-windmill' AND cue = 'pull movement targeting abs. Kettlebell.';

-- Dumbbell Side Bend
UPDATE exercises SET cue = 'isolation core movement targeting abs with Dumbbell.'
WHERE slug = 'dumbbell-side-bend' AND cue = 'Isolation pull movement targeting abs. Dumbbells.';

-- Elbow to Knee
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'elbow-to-knee' AND cue = 'Compound pull movement targeting abs.';

-- Exercise Ball Crunch
UPDATE exercises SET cue = 'isolation core movement targeting abs with Stability Ball.'
WHERE slug = 'exercise-ball-crunch' AND cue = 'Isolation pull movement targeting abs. Stability ball.';

-- Exercise Ball Pull-In
UPDATE exercises SET cue = 'compound core movement targeting abs with Stability Ball.'
WHERE slug = 'exercise-ball-pull-in' AND cue = 'Compound pull movement targeting abs. Stability ball.';

-- Flat Bench Leg Pull-In
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'flat-bench-leg-pull-in' AND cue = 'Compound pull movement targeting abs. Bench.';

-- Flat Bench Lying Leg Raise
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'flat-bench-lying-leg-raise' AND cue = 'Isolation pull movement targeting abs. Bench.';

-- Frog Sit-Ups
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'frog-sit-ups' AND cue = 'Isolation pull movement targeting abs.';

-- Gorilla Chin/Crunch
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'gorilla-chin-crunch' AND cue = 'Compound pull movement targeting abs.';

-- Hanging Leg Raise
UPDATE exercises SET cue = 'isolation core movement targeting abs with Pull-up Bar.'
WHERE slug = 'hanging-leg-raise' AND cue = 'Isolation pull movement targeting abs. Pull-up bar.';

-- Hanging Pike
UPDATE exercises SET cue = 'compound core movement targeting abs with Pull-up Bar.'
WHERE slug = 'hanging-pike' AND cue = 'Compound pull movement targeting abs. Pull-up bar.';

-- Jackknife Sit-Up
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'jackknife-sit-up' AND cue = 'Compound pull movement targeting abs.';

-- Janda Sit-Up
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'janda-sit-up' AND cue = 'Isolation pull movement targeting abs.';

-- Kettlebell Figure 8
UPDATE exercises SET cue = 'Core movement targeting abs with Kettlebell.'
WHERE slug = 'kettlebell-figure-8' AND cue = 'pull movement targeting abs. Kettlebell.';

-- Kettlebell Pass Between The Legs
UPDATE exercises SET cue = 'compound core movement targeting abs with Kettlebell.'
WHERE slug = 'kettlebell-pass-between-the-legs' AND cue = 'Compound pull movement targeting abs. Kettlebell.';

-- Kettlebell Windmill
UPDATE exercises SET cue = 'compound core movement targeting abs with Kettlebell.'
WHERE slug = 'kettlebell-windmill' AND cue = 'Compound pull movement targeting abs. Kettlebell.';

-- Kneeling Cable Crunch With Alternating Oblique Twists
UPDATE exercises SET cue = 'isolation core movement targeting abs with Cable.'
WHERE slug = 'kneeling-cable-crunch-with-alternating-oblique-twists' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Landmine 180's
UPDATE exercises SET cue = 'compound core movement targeting abs with Barbell.'
WHERE slug = 'landmine-180-s' AND cue = 'Compound pull movement targeting abs. Barbell.';

-- Leg Pull-In
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'leg-pull-in' AND cue = 'Compound pull movement targeting abs.';

-- Medicine Ball Full Twist
UPDATE exercises SET cue = 'compound core movement targeting abs with Medicine Ball.'
WHERE slug = 'medicine-ball-full-twist' AND cue = 'Compound pull movement targeting abs. Medicine ball.';

-- Oblique Crunches
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'oblique-crunches' AND cue = 'Isolation pull movement targeting abs.';

-- Oblique Crunches - On The Floor
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'oblique-crunches-on-the-floor' AND cue = 'Isolation pull movement targeting abs.';

-- One-Arm High-Pulley Cable Side Bends
UPDATE exercises SET cue = 'isolation core movement targeting abs with Cable.'
WHERE slug = 'one-arm-high-pulley-cable-side-bends' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- One-Arm Medicine Ball Slam
UPDATE exercises SET cue = 'compound core movement targeting abs with Medicine Ball.'
WHERE slug = 'one-arm-medicine-ball-slam' AND cue = 'Compound pull movement targeting abs. Medicine ball.';

-- Pallof Press
UPDATE exercises SET cue = 'isolation core movement targeting abs with Cable.'
WHERE slug = 'pallof-press' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Pallof Press With Rotation
UPDATE exercises SET cue = 'compound core movement targeting abs with Cable.'
WHERE slug = 'pallof-press-with-rotation' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Press Sit-Up
UPDATE exercises SET cue = 'compound core movement targeting abs with Barbell.'
WHERE slug = 'press-sit-up' AND cue = 'Compound push movement targeting abs. Barbell.';

-- Reverse Crunch
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'reverse-crunch' AND cue = 'Isolation pull movement targeting abs.';

-- Rope Crunch
UPDATE exercises SET cue = 'isolation core movement targeting abs with Cable.'
WHERE slug = 'rope-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Russian Twist
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'russian-twist' AND cue = 'Compound pull movement targeting abs.';

-- Seated Barbell Twist
UPDATE exercises SET cue = 'isolation core movement targeting abs with Barbell.'
WHERE slug = 'seated-barbell-twist' AND cue = 'Isolation pull movement targeting abs. Barbell.';

-- Seated Flat Bench Leg Pull-In
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'seated-flat-bench-leg-pull-in' AND cue = 'Compound pull movement targeting abs. Bench.';

-- Seated Leg Tucks
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'seated-leg-tucks' AND cue = 'Isolation pull movement targeting abs.';

-- Side Jackknife
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'side-jackknife' AND cue = 'Compound pull movement targeting abs.';

-- Sit-Up
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'sit-up' AND cue = 'Isolation pull movement targeting abs.';

-- Smith Machine Hip Raise
UPDATE exercises SET cue = 'isolation core movement targeting abs with Smith Machine.'
WHERE slug = 'smith-machine-hip-raise' AND cue = 'Isolation pull movement targeting abs. Smith machine.';

-- Spell Caster
UPDATE exercises SET cue = 'compound core movement targeting abs with Dumbbell.'
WHERE slug = 'spell-caster' AND cue = 'Compound pull movement targeting abs. Dumbbells.';

-- Spider Crawl
UPDATE exercises SET cue = 'compound core movement targeting abs.'
WHERE slug = 'spider-crawl' AND cue = 'Compound pull movement targeting abs.';

-- Standing Cable Lift
UPDATE exercises SET cue = 'compound core movement targeting abs with Cable.'
WHERE slug = 'standing-cable-lift' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Standing Cable Wood Chop
UPDATE exercises SET cue = 'compound core movement targeting abs with Cable.'
WHERE slug = 'standing-cable-wood-chop' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Standing Rope Crunch
UPDATE exercises SET cue = 'isolation core movement targeting abs with Cable.'
WHERE slug = 'standing-rope-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Supine One-Arm Overhead Throw
UPDATE exercises SET cue = 'compound core movement targeting abs with Medicine Ball.'
WHERE slug = 'supine-one-arm-overhead-throw' AND cue = 'Compound pull movement targeting abs. Medicine ball.';

-- Supine Two-Arm Overhead Throw
UPDATE exercises SET cue = 'compound core movement targeting abs with Medicine Ball.'
WHERE slug = 'supine-two-arm-overhead-throw' AND cue = 'Compound pull movement targeting abs. Medicine ball.';

-- Tuck Crunch
UPDATE exercises SET cue = 'isolation core movement targeting abs.'
WHERE slug = 'tuck-crunch' AND cue = 'Isolation pull movement targeting abs.';

-- Weighted Ball Side Bend
UPDATE exercises SET cue = 'isolation core movement targeting abs with Stability Ball.'
WHERE slug = 'weighted-ball-side-bend' AND cue = 'Isolation pull movement targeting abs. Stability ball.';

-- Weighted Crunches
UPDATE exercises SET cue = 'isolation core movement targeting abs with Medicine Ball.'
WHERE slug = 'weighted-crunches' AND cue = 'Isolation pull movement targeting abs. Medicine ball.';

-- Air Bike
UPDATE exercises SET cue = 'compound cardio movement targeting abs.'
WHERE slug = 'air-bike' AND cue = 'Compound pull movement targeting abs.';

-- Chest Push with Run Release
UPDATE exercises SET cue = 'compound cardio movement targeting chest with Medicine Ball.'
WHERE slug = 'chest-push-with-run-release' AND cue = 'Compound push movement targeting chest. Medicine ball.';

-- Fast Skipping
UPDATE exercises SET cue = 'compound cardio movement targeting quads.'
WHERE slug = 'fast-skipping' AND cue = 'Compound push movement targeting quads. Jump rope.';

-- Wind Sprints
UPDATE exercises SET cue = 'compound cardio movement targeting abs.'
WHERE slug = 'wind-sprints' AND cue = 'Compound pull movement targeting abs.';

-- Band Hip Adductions
UPDATE exercises SET cue = 'isolation movement targeting adductors with Bands.'
WHERE slug = 'band-hip-adductions' AND cue = 'Isolation pull movement targeting adductors. Bands.';

-- Barbell Shrug
UPDATE exercises SET cue = 'isolation movement targeting traps with Barbell.'
WHERE slug = 'barbell-shrug' AND cue = 'Isolation pull movement targeting traps. Barbell.';

-- Barbell Shrug Behind The Back
UPDATE exercises SET cue = 'isolation movement targeting traps with Barbell.'
WHERE slug = 'barbell-shrug-behind-the-back' AND cue = 'Isolation pull movement targeting traps. Barbell.';

-- Cable Shrugs
UPDATE exercises SET cue = 'isolation movement targeting traps with Cable.'
WHERE slug = 'cable-shrugs' AND cue = 'Isolation pull movement targeting traps. Cable machine.';

-- Calf-Machine Shoulder Shrug
UPDATE exercises SET cue = 'isolation movement targeting traps.'
WHERE slug = 'calf-machine-shoulder-shrug' AND cue = 'Isolation pull movement targeting traps. Machine.';

-- Dumbbell Shrug
UPDATE exercises SET cue = 'isolation movement targeting traps with Dumbbell.'
WHERE slug = 'dumbbell-shrug' AND cue = 'Isolation pull movement targeting traps. Dumbbells.';

-- Glute Kickback
UPDATE exercises SET cue = 'isolation movement targeting glutes.'
WHERE slug = 'glute-kickback' AND cue = 'Compound push movement targeting glutes.';

-- Hip Flexion with Band
UPDATE exercises SET cue = 'isolation movement targeting hip flexors with Bands.'
WHERE slug = 'hip-flexion-with-band' AND cue = 'Compound pull movement targeting quads. Bands.';

-- Kettlebell Sumo High Pull
UPDATE exercises SET cue = 'compound movement targeting traps with Kettlebell.'
WHERE slug = 'kettlebell-sumo-high-pull' AND cue = 'Compound pull movement targeting traps. Kettlebell.';

-- Lateral Bound
UPDATE exercises SET cue = 'compound movement targeting adductors.'
WHERE slug = 'lateral-bound' AND cue = 'Compound push movement targeting adductors.';

-- Leverage Shrug
UPDATE exercises SET cue = 'isolation movement targeting traps.'
WHERE slug = 'leverage-shrug' AND cue = 'Isolation pull movement targeting traps. Machine.';

-- Middle Back Shrug
UPDATE exercises SET cue = 'isolation movement targeting upper_back with Dumbbell.'
WHERE slug = 'middle-back-shrug' AND cue = 'Isolation pull movement targeting upper back. Dumbbells.';

-- Monster Walk
UPDATE exercises SET cue = 'compound movement targeting abductors with Bands.'
WHERE slug = 'monster-walk' AND cue = 'Compound pull movement targeting abductors. Bands.';

-- Smith Machine Behind the Back Shrug
UPDATE exercises SET cue = 'isolation movement targeting traps with Smith Machine.'
WHERE slug = 'smith-machine-behind-the-back-shrug' AND cue = 'Isolation pull movement targeting traps. Smith machine.';

-- Thigh Abductor
UPDATE exercises SET cue = 'isolation movement targeting abductors.'
WHERE slug = 'thigh-abductor' AND cue = 'Isolation push movement targeting abductors. Machine.';

-- Thigh Adductor
UPDATE exercises SET cue = 'isolation movement targeting adductors.'
WHERE slug = 'thigh-adductor' AND cue = 'Isolation pull movement targeting adductors. Machine.';
