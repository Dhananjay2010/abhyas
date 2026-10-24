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
-- Part 4: Lower-Body Exercise Description Fixes
-- ============================================================================

-- 3/4 Sit-Up
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = '3-4-sit-up' AND cue = 'Compound pull movement targeting abs.';

-- Ab Crunch Machine
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Machine.'
WHERE slug = 'ab-crunch-machine' AND cue = 'Isolation pull movement targeting abs. Machine.';

-- Advanced Kettlebell Windmill
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Kettlebell.'
WHERE slug = 'advanced-kettlebell-windmill' AND cue = 'Isolation push movement targeting abs. Kettlebell.';

-- Air Bike
UPDATE exercises SET cue = 'Compound cardio movement targeting abs.'
WHERE slug = 'air-bike' AND cue = 'Compound pull movement targeting abs.';

-- Alternate Hammer Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'alternate-hammer-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Alternate Heel Touchers
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'alternate-heel-touchers' AND cue = 'Isolation pull movement targeting abs.';

-- Alternate Incline Dumbbell Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. adjustable_bench, Dumbbells.'
WHERE slug = 'alternate-incline-dumbbell-curl' AND cue = 'Isolation pull movement targeting biceps. Bench, Dumbbells.';

-- Alternating Cable Shoulder Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Cable machine.'
WHERE slug = 'alternating-cable-shoulder-press' AND cue = 'Compound push movement targeting front delts, side delts. Cable machine.';

-- Alternating Deltoid Raise
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'alternating-deltoid-raise' AND cue = 'Isolation push movement targeting front delts, side delts. Dumbbells.';

-- Alternating Floor Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Kettlebell.'
WHERE slug = 'alternating-floor-press' AND cue = 'Compound push movement targeting chest. Kettlebell.';

-- Alternating Hang Clean
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'alternating-hang-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Alternating Kettlebell Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'alternating-kettlebell-press' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Alternating Kettlebell Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Kettlebell.'
WHERE slug = 'alternating-kettlebell-row' AND cue = 'Isolation pull movement targeting upper back. Kettlebell.';

-- Alternating Renegade Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Kettlebell.'
WHERE slug = 'alternating-renegade-row' AND cue = 'Compound pull movement targeting upper back. Kettlebell.';

-- Anti-Gravity Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Barbell.'
WHERE slug = 'anti-gravity-press' AND cue = 'Compound push movement targeting front delts, side delts. Barbell.';

-- Arnold Dumbbell Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'arnold-dumbbell-press' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Around The Worlds
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Dumbbells.'
WHERE slug = 'around-the-worlds' AND cue = 'Compound push movement targeting chest. Dumbbells.';

-- Back Flyes - With Bands
UPDATE exercises SET cue = 'Compound rear_delt movement targeting front delts. Bands.'
WHERE slug = 'back-flyes-with-bands' AND cue = 'Isolation pull movement targeting rear delts. Bands.';

-- Ball Leg Curl
UPDATE exercises SET cue = 'Isolation hinge movement targeting hamstrings. stability_ball.'
WHERE slug = 'ball-leg-curl' AND cue = 'Isolation pull movement targeting hamstrings. Stability ball.';

-- Band Good Morning
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Bands.'
WHERE slug = 'band-good-morning' AND cue = 'Compound pull movement targeting hamstrings. Bands.';

-- Band Good Morning (Pull Through)
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Bands.'
WHERE slug = 'band-good-morning-pull-through' AND cue = 'Compound pull movement targeting hamstrings. Bands.';

-- Band Hip Adductions
UPDATE exercises SET cue = 'Isolation other movement targeting adductors. Bands.'
WHERE slug = 'band-hip-adductions' AND cue = 'Isolation pull movement targeting adductors. Bands.';

-- Band Pull Apart
UPDATE exercises SET cue = 'Isolation rear_delt movement targeting rear delts. Bands.'
WHERE slug = 'band-pull-apart' AND cue = 'Isolation pull movement targeting rear delts. Bands.';

-- Band Skull Crusher
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Bands.'
WHERE slug = 'band-skull-crusher' AND cue = 'Isolation push movement targeting triceps. Bands.';

-- Barbell Ab Rollout
UPDATE exercises SET cue = 'Compound core movement targeting abs. Barbell.'
WHERE slug = 'barbell-ab-rollout' AND cue = 'Compound pull movement targeting abs. Barbell.';

-- Barbell Ab Rollout - On Knees
UPDATE exercises SET cue = 'Compound core movement targeting abs. Barbell.'
WHERE slug = 'barbell-ab-rollout-on-knees' AND cue = 'Compound pull movement targeting abs. Barbell.';

-- Barbell Bench Press - Medium Grip
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Barbell, Bench.'
WHERE slug = 'barbell-bench-press-medium-grip' AND cue = 'Compound push movement targeting chest. Barbell, Bench.';

-- Barbell Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Barbell.'
WHERE slug = 'barbell-curl' AND cue = 'Isolation pull movement targeting biceps. Barbell.';

-- Barbell Curls Lying Against An Incline
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. adjustable_bench, Barbell, Bench.'
WHERE slug = 'barbell-curls-lying-against-an-incline' AND cue = 'Isolation pull movement targeting biceps. Bench, Barbell.';

-- Barbell Deadlift
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'barbell-deadlift' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Barbell Full Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'barbell-full-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Glute Bridge
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Barbell.'
WHERE slug = 'barbell-glute-bridge' AND cue = 'Compound push movement targeting glutes. Barbell.';

-- Barbell Guillotine Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Barbell, Bench.'
WHERE slug = 'barbell-guillotine-bench-press' AND cue = 'Compound push movement targeting chest. Barbell, Bench.';

-- Barbell Hack Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'barbell-hack-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Hip Thrust
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Barbell.'
WHERE slug = 'barbell-hip-thrust' AND cue = 'Compound push movement targeting glutes. Barbell.';

-- Barbell Incline Bench Press - Medium Grip
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Barbell, Bench.'
WHERE slug = 'barbell-incline-bench-press-medium-grip' AND cue = 'Compound push movement targeting chest. Bench, Barbell.';

-- Barbell Incline Shoulder Raise
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting front delts. adjustable_bench, Barbell.'
WHERE slug = 'barbell-incline-shoulder-raise' AND cue = 'Compound push movement targeting front delts, side delts. Bench, Barbell.';

-- Barbell Lunge
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Barbell.'
WHERE slug = 'barbell-lunge' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Barbell Rear Delt Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting rear delts. Barbell.'
WHERE slug = 'barbell-rear-delt-row' AND cue = 'Compound pull movement targeting rear delts. Barbell.';

-- Barbell Rollout from Bench
UPDATE exercises SET cue = 'Compound core movement targeting abs. Barbell, Bench.'
WHERE slug = 'barbell-rollout-from-bench' AND cue = 'Compound pull movement targeting abs. Barbell, Bench.';

-- Barbell Seated Calf Raise
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Barbell.'
WHERE slug = 'barbell-seated-calf-raise' AND cue = 'Isolation push movement targeting calves. Barbell.';

-- Barbell Shoulder Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Barbell.'
WHERE slug = 'barbell-shoulder-press' AND cue = 'Compound push movement targeting front delts, side delts. Barbell.';

-- Barbell Shrug
UPDATE exercises SET cue = 'Isolation other movement targeting traps. Barbell.'
WHERE slug = 'barbell-shrug' AND cue = 'Isolation pull movement targeting traps. Barbell.';

-- Barbell Shrug Behind The Back
UPDATE exercises SET cue = 'Isolation other movement targeting traps. Barbell.'
WHERE slug = 'barbell-shrug-behind-the-back' AND cue = 'Isolation pull movement targeting traps. Barbell.';

-- Barbell Side Bend
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Barbell.'
WHERE slug = 'barbell-side-bend' AND cue = 'Isolation pull movement targeting abs. Barbell.';

-- Barbell Side Split Squat
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Barbell, Rack.'
WHERE slug = 'barbell-side-split-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Squat To A Bench
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Bench, Rack.'
WHERE slug = 'barbell-squat-to-a-bench' AND cue = 'Compound push movement targeting quads. Barbell, Bench, Rack.';

-- Barbell Step Ups
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Barbell.'
WHERE slug = 'barbell-step-ups' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Barbell Walking Lunge
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Barbell.'
WHERE slug = 'barbell-walking-lunge' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Bench Dips
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting triceps. dip_bars, Bench.'
WHERE slug = 'bench-dips' AND cue = 'Compound push movement targeting triceps. Dip bars, Bench.';

-- Bench Jump
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Bench.'
WHERE slug = 'bench-jump' AND cue = 'Compound push movement targeting quads. Bench.';

-- Bench Press - Powerlifting
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting triceps. Barbell, Bench.'
WHERE slug = 'bench-press-powerlifting' AND cue = 'Compound push movement targeting triceps. Barbell, Bench.';

-- Bench Press - With Bands
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Bench, Bands.'
WHERE slug = 'bench-press-with-bands' AND cue = 'Compound push movement targeting chest. Bench, Bands.';

-- Bench Press with Chains
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting triceps. Barbell, Bench.'
WHERE slug = 'bench-press-with-chains' AND cue = 'Compound push movement targeting triceps. Barbell, Bench.';

-- Bent-Arm Barbell Pullover
UPDATE exercises SET cue = 'Compound vertical_pull movement targeting lats. Barbell.'
WHERE slug = 'bent-arm-barbell-pullover' AND cue = 'Compound pull movement targeting lats. Barbell.';

-- Bent-Arm Dumbbell Pullover
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Dumbbells.'
WHERE slug = 'bent-arm-dumbbell-pullover' AND cue = 'Compound push movement targeting chest. Dumbbells.';

-- Bent-Knee Hip Raise
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'bent-knee-hip-raise' AND cue = 'Compound pull movement targeting abs.';

-- Bent Over Barbell Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Barbell.'
WHERE slug = 'bent-over-barbell-row' AND cue = 'Compound pull movement targeting upper back. Barbell.';

-- Bent Over Dumbbell Rear Delt Raise With Head On Bench
UPDATE exercises SET cue = 'Isolation rear_delt movement targeting rear delts. Dumbbells, Bench.'
WHERE slug = 'bent-over-dumbbell-rear-delt-raise-with-head-on-bench' AND cue = 'Isolation pull movement targeting rear delts. Dumbbells, Bench.';

-- Bent Over Low-Pulley Side Lateral
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Cable machine.'
WHERE slug = 'bent-over-low-pulley-side-lateral' AND cue = 'Isolation pull movement targeting side delts. Cable machine.';

-- Bent Over One-Arm Long Bar Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Barbell.'
WHERE slug = 'bent-over-one-arm-long-bar-row' AND cue = 'Compound pull movement targeting upper back. Barbell.';

-- Bent Over Two-Arm Long Bar Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Barbell.'
WHERE slug = 'bent-over-two-arm-long-bar-row' AND cue = 'Compound pull movement targeting upper back. Barbell.';

-- Bent Over Two-Dumbbell Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Dumbbells.'
WHERE slug = 'bent-over-two-dumbbell-row' AND cue = 'Compound pull movement targeting upper back. Dumbbells.';

-- Bent Over Two-Dumbbell Row With Palms In
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Dumbbells.'
WHERE slug = 'bent-over-two-dumbbell-row-with-palms-in' AND cue = 'Compound pull movement targeting upper back. Dumbbells.';

-- Bent Press
UPDATE exercises SET cue = 'Compound core movement targeting abs. Kettlebell.'
WHERE slug = 'bent-press' AND cue = 'Compound pull movement targeting abs. Kettlebell.';

-- Board Press
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Barbell.'
WHERE slug = 'board-press' AND cue = 'Compound push movement targeting triceps. Barbell.';

-- Body Tricep Press
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps.'
WHERE slug = 'body-tricep-press' AND cue = 'Isolation push movement targeting triceps.';

-- Body-Up
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps.'
WHERE slug = 'body-up' AND cue = 'Isolation push movement targeting triceps.';

-- Bodyweight Flyes
UPDATE exercises SET cue = 'Isolation horizontal_press movement targeting chest. ez_bar.'
WHERE slug = 'bodyweight-flyes' AND cue = 'Isolation push movement targeting chest. EZ bar.';

-- Bodyweight Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'bodyweight-squat' AND cue = 'Compound push movement targeting quads.';

-- Bosu Ball Cable Crunch With Side Bends
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'bosu-ball-cable-crunch-with-side-bends' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Bottoms Up
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'bottoms-up' AND cue = 'Compound pull movement targeting abs.';

-- Bottoms-Up Clean From The Hang Position
UPDATE exercises SET cue = 'Compound forearm movement targeting forearms. Kettlebell.'
WHERE slug = 'bottoms-up-clean-from-the-hang-position' AND cue = 'Compound pull movement targeting forearms. Kettlebell.';

-- Box Squat with Bands
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'box-squat-with-bands' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Box Squat with Chains
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'box-squat-with-chains' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Bradford/Rocky Presses
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Barbell.'
WHERE slug = 'bradford-rocky-presses' AND cue = 'Compound push movement targeting front delts, side delts. Barbell.';

-- Butt Lift (Bridge)
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes.'
WHERE slug = 'butt-lift-bridge' AND cue = 'Isolation push movement targeting glutes.';

-- Butt-Ups
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'butt-ups' AND cue = 'Compound pull movement targeting abs.';

-- Cable Chest Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Cable machine.'
WHERE slug = 'cable-chest-press' AND cue = 'Compound push movement targeting chest. Cable machine.';

-- Cable Crossover
UPDATE exercises SET cue = 'Isolation horizontal_press movement targeting chest. Cable machine.'
WHERE slug = 'cable-crossover' AND cue = 'Isolation push movement targeting chest. Cable machine.';

-- Cable Crunch
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'cable-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Cable Deadlifts
UPDATE exercises SET cue = 'Compound hinge movement targeting quads. Cable machine.'
WHERE slug = 'cable-deadlifts' AND cue = 'Compound pull movement targeting quads. Cable machine.';

-- Cable Hammer Curls - Rope Attachment
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Cable machine.'
WHERE slug = 'cable-hammer-curls-rope-attachment' AND cue = 'Isolation pull movement targeting biceps. Cable machine.';

-- Cable Hip Adduction
UPDATE exercises SET cue = 'Isolation squat movement targeting quads. Cable machine.'
WHERE slug = 'cable-hip-adduction' AND cue = 'Isolation pull movement targeting quads. Cable machine.';

-- Cable Incline Pushdown
UPDATE exercises SET cue = 'Isolation vertical_pull movement targeting lats. adjustable_bench, Cable machine.'
WHERE slug = 'cable-incline-pushdown' AND cue = 'Isolation pull movement targeting lats. Bench, Cable machine.';

-- Cable Incline Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. adjustable_bench, Cable machine.'
WHERE slug = 'cable-incline-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Bench, Cable machine.';

-- Cable Iron Cross
UPDATE exercises SET cue = 'Isolation horizontal_press movement targeting chest. Cable machine.'
WHERE slug = 'cable-iron-cross' AND cue = 'Isolation push movement targeting chest. Cable machine.';

-- Cable Judo Flip
UPDATE exercises SET cue = 'Compound core movement targeting abs. Cable machine.'
WHERE slug = 'cable-judo-flip' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Cable Lying Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine, Bench.'
WHERE slug = 'cable-lying-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Cable machine, Bench.';

-- Cable One Arm Tricep Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'cable-one-arm-tricep-extension' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Cable Preacher Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Cable machine.'
WHERE slug = 'cable-preacher-curl' AND cue = 'Isolation pull movement targeting biceps. Cable machine.';

-- Cable Rear Delt Fly
UPDATE exercises SET cue = 'Isolation rear_delt movement targeting rear delts. Cable machine.'
WHERE slug = 'cable-rear-delt-fly' AND cue = 'Isolation pull movement targeting rear delts. Cable machine.';

-- Cable Reverse Crunch
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'cable-reverse-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Cable Rope Overhead Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'cable-rope-overhead-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Cable Rope Rear-Delt Rows
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting front delts. Cable machine.'
WHERE slug = 'cable-rope-rear-delt-rows' AND cue = 'Compound pull movement targeting front delts, side delts. Cable machine.';

-- Cable Russian Twists
UPDATE exercises SET cue = 'Compound core movement targeting abs. Cable machine.'
WHERE slug = 'cable-russian-twists' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Cable Seated Crunch
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'cable-seated-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Cable Seated Lateral Raise
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Cable machine.'
WHERE slug = 'cable-seated-lateral-raise' AND cue = 'Isolation pull movement targeting side delts. Cable machine.';

-- Cable Shoulder Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Cable machine.'
WHERE slug = 'cable-shoulder-press' AND cue = 'Compound push movement targeting front delts, side delts. Cable machine.';

-- Cable Shrugs
UPDATE exercises SET cue = 'Isolation other movement targeting traps. Cable machine.'
WHERE slug = 'cable-shrugs' AND cue = 'Isolation pull movement targeting traps. Cable machine.';

-- Cable Wrist Curl
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Cable machine.'
WHERE slug = 'cable-wrist-curl' AND cue = 'Isolation pull movement targeting forearms. Cable machine.';

-- Calf-Machine Shoulder Shrug
UPDATE exercises SET cue = 'Isolation other movement targeting traps. Machine.'
WHERE slug = 'calf-machine-shoulder-shrug' AND cue = 'Isolation pull movement targeting traps. Machine.';

-- Calf Press
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Machine.'
WHERE slug = 'calf-press' AND cue = 'Isolation push movement targeting calves. Machine.';

-- Calf Press On The Leg Press Machine
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Leg press.'
WHERE slug = 'calf-press-on-the-leg-press-machine' AND cue = 'Isolation push movement targeting calves. Leg press.';

-- Calf Raise On A Dumbbell
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Dumbbells.'
WHERE slug = 'calf-raise-on-a-dumbbell' AND cue = 'Isolation push movement targeting calves. Dumbbells.';

-- Calf Raises - With Bands
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Bands.'
WHERE slug = 'calf-raises-with-bands' AND cue = 'Isolation push movement targeting calves. Bands.';

-- Car Drivers
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. Barbell.'
WHERE slug = 'car-drivers' AND cue = 'Isolation push movement targeting front delts, side delts. Barbell.';

-- Chair Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Machine.'
WHERE slug = 'chair-squat' AND cue = 'Compound push movement targeting quads. Machine.';

-- Chest Push from 3 point stance
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Medicine ball.'
WHERE slug = 'chest-push-from-3-point-stance' AND cue = 'Compound push movement targeting chest. Medicine ball.';

-- Chest Push (multiple response)
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Medicine ball.'
WHERE slug = 'chest-push-multiple-response' AND cue = 'Compound push movement targeting chest. Medicine ball.';

-- Chest Push (single response)
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Medicine ball.'
WHERE slug = 'chest-push-single-response' AND cue = 'Compound push movement targeting chest. Medicine ball.';

-- Chest Push with Run Release
UPDATE exercises SET cue = 'Compound cardio movement targeting chest. Medicine ball.'
WHERE slug = 'chest-push-with-run-release' AND cue = 'Compound push movement targeting chest. Medicine ball.';

-- Chin-Up
UPDATE exercises SET cue = 'Compound vertical_pull movement targeting lats. pull_up_bar.'
WHERE slug = 'chin-up' AND cue = 'Compound pull movement targeting lats. Pull-up bar.';

-- Clean and Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Barbell.'
WHERE slug = 'clean-and-press' AND cue = 'Compound push movement targeting front delts, side delts. Barbell.';

-- Clock Push-Up
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest.'
WHERE slug = 'clock-push-up' AND cue = 'Compound push movement targeting chest.';

-- Close-Grip Barbell Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting triceps. Barbell, Bench.'
WHERE slug = 'close-grip-barbell-bench-press' AND cue = 'Compound push movement targeting triceps. Barbell, Bench.';

-- Close-Grip Dumbbell Press
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'close-grip-dumbbell-press' AND cue = 'Compound push movement targeting triceps. Dumbbells.';

-- Close-Grip EZ Bar Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Barbell.'
WHERE slug = 'close-grip-ez-bar-curl' AND cue = 'Isolation pull movement targeting biceps. Barbell.';

-- Close-Grip EZ-Bar Curl with Band
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. ez_bar.'
WHERE slug = 'close-grip-ez-bar-curl-with-band' AND cue = 'Isolation pull movement targeting biceps. EZ bar.';

-- Close-Grip EZ-Bar Press
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. ez_bar.'
WHERE slug = 'close-grip-ez-bar-press' AND cue = 'Compound push movement targeting triceps. EZ bar.';

-- Close-Grip Front Lat Pulldown
UPDATE exercises SET cue = 'Compound vertical_pull movement targeting lats. Cable machine.'
WHERE slug = 'close-grip-front-lat-pulldown' AND cue = 'Compound pull movement targeting lats. Cable machine.';

-- Close-Grip Push-Up off of a Dumbbell
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting triceps.'
WHERE slug = 'close-grip-push-up-off-of-a-dumbbell' AND cue = 'Compound push movement targeting triceps.';

-- Close-Grip Standing Barbell Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Barbell.'
WHERE slug = 'close-grip-standing-barbell-curl' AND cue = 'Isolation pull movement targeting biceps. Barbell.';

-- Cocoons
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'cocoons' AND cue = 'Compound pull movement targeting abs.';

-- Concentration Curls
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'concentration-curls' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Cross-Body Crunch
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'cross-body-crunch' AND cue = 'Compound pull movement targeting abs.';

-- Cross Body Hammer Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'cross-body-hammer-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Cross Over - With Bands
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Bands.'
WHERE slug = 'cross-over-with-bands' AND cue = 'Compound push movement targeting chest. Bands.';

-- Crunch - Hands Overhead
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'crunch-hands-overhead' AND cue = 'Isolation pull movement targeting abs.';

-- Crunch - Legs On Exercise Ball
UPDATE exercises SET cue = 'Isolation core movement targeting abs. stability_ball.'
WHERE slug = 'crunch-legs-on-exercise-ball' AND cue = 'Isolation pull movement targeting abs.';

-- Crunches
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'crunches' AND cue = 'Isolation pull movement targeting abs.';

-- Cuban Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'cuban-press' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Dead Bug
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'dead-bug' AND cue = 'Compound pull movement targeting abs.';

-- Deadlift with Bands
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'deadlift-with-bands' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Deadlift with Chains
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'deadlift-with-chains' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Decline Barbell Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Barbell, Bench.'
WHERE slug = 'decline-barbell-bench-press' AND cue = 'Compound push movement targeting chest. Bench, Barbell.';

-- Decline Close-Grip Bench To Skull Crusher
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. adjustable_bench, Barbell, Bench.'
WHERE slug = 'decline-close-grip-bench-to-skull-crusher' AND cue = 'Compound push movement targeting triceps. Bench, Barbell.';

-- Decline Crunch
UPDATE exercises SET cue = 'Isolation core movement targeting abs. adjustable_bench.'
WHERE slug = 'decline-crunch' AND cue = 'Isolation pull movement targeting abs. Bench.';

-- Decline Dumbbell Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Dumbbells, Bench.'
WHERE slug = 'decline-dumbbell-bench-press' AND cue = 'Compound push movement targeting chest. Bench, Dumbbells.';

-- Decline Dumbbell Flyes
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Dumbbells.'
WHERE slug = 'decline-dumbbell-flyes' AND cue = 'Compound push movement targeting chest. Bench, Dumbbells.';

-- Decline Dumbbell Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. adjustable_bench, Dumbbells.'
WHERE slug = 'decline-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Bench, Dumbbells.';

-- Decline EZ Bar Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. adjustable_bench, Barbell.'
WHERE slug = 'decline-ez-bar-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Bench, Barbell.';

-- Decline Oblique Crunch
UPDATE exercises SET cue = 'Compound core movement targeting abs. adjustable_bench.'
WHERE slug = 'decline-oblique-crunch' AND cue = 'Compound pull movement targeting abs. Bench.';

-- Decline Reverse Crunch
UPDATE exercises SET cue = 'Compound core movement targeting abs. adjustable_bench.'
WHERE slug = 'decline-reverse-crunch' AND cue = 'Compound pull movement targeting abs. Bench.';

-- Decline Smith Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Smith machine.'
WHERE slug = 'decline-smith-press' AND cue = 'Compound push movement targeting chest. Bench, Smith machine.';

-- Deficit Deadlift
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'deficit-deadlift' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Dip Machine
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting triceps. dip_bars, Machine.'
WHERE slug = 'dip-machine' AND cue = 'Compound push movement targeting triceps. Dip bars, Machine.';

-- Dips - Triceps Version
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting triceps. dip_bars.'
WHERE slug = 'dips-triceps-version' AND cue = 'Compound push movement targeting triceps. Dip bars.';

-- Double Kettlebell Alternating Hang Clean
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'double-kettlebell-alternating-hang-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Double Kettlebell Jerk
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'double-kettlebell-jerk' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Double Kettlebell Push Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'double-kettlebell-push-press' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Double Kettlebell Windmill
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Kettlebell.'
WHERE slug = 'double-kettlebell-windmill' AND cue = 'pull movement targeting abs. Kettlebell.';

-- Drag Curl
UPDATE exercises SET cue = 'Compound biceps movement targeting biceps. Barbell.'
WHERE slug = 'drag-curl' AND cue = 'Compound pull movement targeting biceps. Barbell.';

-- Dumbbell Alternate Bicep Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'dumbbell-alternate-bicep-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Dumbbell Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Dumbbells, Bench.'
WHERE slug = 'dumbbell-bench-press' AND cue = 'Compound push movement targeting chest. Dumbbells, Bench.';

-- Dumbbell Bench Press with Neutral Grip
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Dumbbells, Bench.'
WHERE slug = 'dumbbell-bench-press-with-neutral-grip' AND cue = 'Compound push movement targeting chest. Dumbbells, Bench.';

-- Dumbbell Bicep Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'dumbbell-bicep-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Dumbbell Clean
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Dumbbells.'
WHERE slug = 'dumbbell-clean' AND cue = 'Compound pull movement targeting hamstrings. Dumbbells.';

-- Dumbbell Floor Press
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'dumbbell-floor-press' AND cue = 'Compound push movement targeting triceps. Dumbbells.';

-- Dumbbell Flyes
UPDATE exercises SET cue = 'Isolation horizontal_press movement targeting chest. Dumbbells.'
WHERE slug = 'dumbbell-flyes' AND cue = 'Isolation push movement targeting chest. Dumbbells.';

-- Dumbbell Incline Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. adjustable_bench, Dumbbells.'
WHERE slug = 'dumbbell-incline-row' AND cue = 'Compound pull movement targeting upper back. Bench, Dumbbells.';

-- Dumbbell Incline Shoulder Raise
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. adjustable_bench, Dumbbells.'
WHERE slug = 'dumbbell-incline-shoulder-raise' AND cue = 'Isolation push movement targeting front delts, side delts. Bench, Dumbbells.';

-- Dumbbell Lunges
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Dumbbells.'
WHERE slug = 'dumbbell-lunges' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Lying One-Arm Rear Lateral Raise
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Dumbbells, Bench.'
WHERE slug = 'dumbbell-lying-one-arm-rear-lateral-raise' AND cue = 'Isolation pull movement targeting side delts. Dumbbells, Bench.';

-- Dumbbell Lying Pronation
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Dumbbells, Bench.'
WHERE slug = 'dumbbell-lying-pronation' AND cue = 'Isolation pull movement targeting forearms. Dumbbells, Bench.';

-- Dumbbell Lying Rear Lateral Raise
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Dumbbells, Bench.'
WHERE slug = 'dumbbell-lying-rear-lateral-raise' AND cue = 'Isolation pull movement targeting side delts. Dumbbells, Bench.';

-- Dumbbell Lying Supination
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Dumbbells, Bench.'
WHERE slug = 'dumbbell-lying-supination' AND cue = 'Isolation pull movement targeting forearms. Dumbbells, Bench.';

-- Dumbbell One-Arm Shoulder Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'dumbbell-one-arm-shoulder-press' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Dumbbell One-Arm Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'dumbbell-one-arm-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Dumbbell One-Arm Upright Row
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Dumbbells.'
WHERE slug = 'dumbbell-one-arm-upright-row' AND cue = 'Compound pull movement targeting side delts, traps. Dumbbells.';

-- Dumbbell Prone Incline Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. adjustable_bench, Dumbbells.'
WHERE slug = 'dumbbell-prone-incline-curl' AND cue = 'Isolation pull movement targeting biceps. Bench, Dumbbells.';

-- Dumbbell Rear Lunge
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Dumbbells.'
WHERE slug = 'dumbbell-rear-lunge' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Scaption
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'dumbbell-scaption' AND cue = 'Isolation push movement targeting front delts, side delts. Dumbbells.';

-- Dumbbell Seated Box Jump
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Dumbbells.'
WHERE slug = 'dumbbell-seated-box-jump' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Seated One-Leg Calf Raise
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Dumbbells.'
WHERE slug = 'dumbbell-seated-one-leg-calf-raise' AND cue = 'Isolation push movement targeting calves. Dumbbells.';

-- Dumbbell Shoulder Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'dumbbell-shoulder-press' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Dumbbell Shrug
UPDATE exercises SET cue = 'Isolation other movement targeting traps. Dumbbells.'
WHERE slug = 'dumbbell-shrug' AND cue = 'Isolation pull movement targeting traps. Dumbbells.';

-- Dumbbell Side Bend
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Dumbbells.'
WHERE slug = 'dumbbell-side-bend' AND cue = 'Isolation pull movement targeting abs. Dumbbells.';

-- Dumbbell Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Dumbbells.'
WHERE slug = 'dumbbell-squat' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Squat To A Bench
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Dumbbells, Bench.'
WHERE slug = 'dumbbell-squat-to-a-bench' AND cue = 'Compound push movement targeting quads. Dumbbells, Bench.';

-- Dumbbell Step Ups
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Dumbbells.'
WHERE slug = 'dumbbell-step-ups' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Tricep Extension -Pronated Grip
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'dumbbell-tricep-extension-pronated-grip' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Elbow to Knee
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'elbow-to-knee' AND cue = 'Compound pull movement targeting abs.';

-- Elevated Back Lunge
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Barbell.'
WHERE slug = 'elevated-back-lunge' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Elevated Cable Rows
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting lats. Cable machine.'
WHERE slug = 'elevated-cable-rows' AND cue = 'Compound pull movement targeting lats. Cable machine.';

-- Elevated Pike Push-Up
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts.'
WHERE slug = 'elevated-pike-push-up' AND cue = 'Compound push movement targeting front delts, side_delts. Bodyweight.';

-- Exercise Ball Crunch
UPDATE exercises SET cue = 'Isolation core movement targeting abs. stability_ball.'
WHERE slug = 'exercise-ball-crunch' AND cue = 'Isolation pull movement targeting abs. Stability ball.';

-- Exercise Ball Pull-In
UPDATE exercises SET cue = 'Compound core movement targeting abs. stability_ball.'
WHERE slug = 'exercise-ball-pull-in' AND cue = 'Compound pull movement targeting abs. Stability ball.';

-- Extended Range One-Arm Kettlebell Floor Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Kettlebell.'
WHERE slug = 'extended-range-one-arm-kettlebell-floor-press' AND cue = 'Compound push movement targeting chest. Kettlebell.';

-- External Rotation with Band
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting front delts. Bands.'
WHERE slug = 'external-rotation-with-band' AND cue = 'Compound pull movement targeting front delts, side delts. Bands.';

-- External Rotation with Cable
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. Cable machine.'
WHERE slug = 'external-rotation-with-cable' AND cue = 'Isolation pull movement targeting front delts, side delts. Cable machine.';

-- EZ-Bar Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. ez_bar.'
WHERE slug = 'ez-bar-curl' AND cue = 'Isolation pull movement targeting biceps. EZ bar.';

-- EZ-Bar Skullcrusher
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. ez_bar.'
WHERE slug = 'ez-bar-skullcrusher' AND cue = 'Isolation push movement targeting triceps. EZ bar.';

-- Face Pull
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting rear delts. Cable machine.'
WHERE slug = 'face-pull' AND cue = 'Compound pull movement targeting rear delts. Cable machine.';

-- Fast Skipping
UPDATE exercises SET cue = 'Compound cardio movement targeting quads. jump_rope.'
WHERE slug = 'fast-skipping' AND cue = 'Compound push movement targeting quads. Jump rope.';

-- Finger Curls
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Barbell.'
WHERE slug = 'finger-curls' AND cue = 'Isolation pull movement targeting forearms. Barbell.';

-- Flat Bench Cable Flyes
UPDATE exercises SET cue = 'Isolation horizontal_press movement targeting chest. Cable machine, Bench.'
WHERE slug = 'flat-bench-cable-flyes' AND cue = 'Isolation push movement targeting chest. Cable machine, Bench.';

-- Flat Bench Leg Pull-In
UPDATE exercises SET cue = 'Compound core movement targeting abs. Bench.'
WHERE slug = 'flat-bench-leg-pull-in' AND cue = 'Compound pull movement targeting abs. Bench.';

-- Flat Bench Lying Leg Raise
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Bench.'
WHERE slug = 'flat-bench-lying-leg-raise' AND cue = 'Isolation pull movement targeting abs. Bench.';

-- Flexor Incline Dumbbell Curls
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. adjustable_bench, Dumbbells.'
WHERE slug = 'flexor-incline-dumbbell-curls' AND cue = 'Isolation pull movement targeting biceps. Bench, Dumbbells.';

-- Floor Press
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Barbell.'
WHERE slug = 'floor-press' AND cue = 'Compound push movement targeting triceps. Barbell.';

-- Floor Press with Chains
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Barbell.'
WHERE slug = 'floor-press-with-chains' AND cue = 'Compound push movement targeting triceps. Barbell.';

-- Freehand Jump Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'freehand-jump-squat' AND cue = 'Compound push movement targeting quads.';

-- Frog Sit-Ups
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'frog-sit-ups' AND cue = 'Isolation pull movement targeting abs.';

-- Front Barbell Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'front-barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Front Barbell Squat To A Bench
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Bench, Rack.'
WHERE slug = 'front-barbell-squat-to-a-bench' AND cue = 'Compound push movement targeting quads. Barbell, Bench, Rack.';

-- Front Cable Raise
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. Cable machine.'
WHERE slug = 'front-cable-raise' AND cue = 'Isolation push movement targeting front delts, side delts. Cable machine.';

-- Front Dumbbell Raise
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'front-dumbbell-raise' AND cue = 'Isolation push movement targeting front delts, side delts. Dumbbells.';

-- Front Incline Dumbbell Raise
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. adjustable_bench, Dumbbells.'
WHERE slug = 'front-incline-dumbbell-raise' AND cue = 'Isolation push movement targeting front delts, side delts. Bench, Dumbbells.';

-- Front Squat (Clean Grip)
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'front-squat-clean-grip' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Front Squats With Two Kettlebells
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Kettlebell.'
WHERE slug = 'front-squats-with-two-kettlebells' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- Front Two-Dumbbell Raise
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'front-two-dumbbell-raise' AND cue = 'Isolation push movement targeting front delts, side delts. Dumbbells.';

-- Full Range-Of-Motion Lat Pulldown
UPDATE exercises SET cue = 'Compound vertical_pull movement targeting lats. Cable machine.'
WHERE slug = 'full-range-of-motion-lat-pulldown' AND cue = 'Compound pull movement targeting lats. Cable machine.';

-- Glute Ham Raise
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Machine.'
WHERE slug = 'glute-ham-raise' AND cue = 'Compound pull movement targeting hamstrings. Machine.';

-- Glute Kickback
UPDATE exercises SET cue = 'Isolation other movement targeting glutes.'
WHERE slug = 'glute-kickback' AND cue = 'Compound push movement targeting glutes.';

-- Goblet Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Kettlebell.'
WHERE slug = 'goblet-squat' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- Good Morning
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell, Rack.'
WHERE slug = 'good-morning' AND cue = 'Compound push movement targeting hamstrings. Barbell, Rack.';

-- Good Morning off Pins
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell, Rack.'
WHERE slug = 'good-morning-off-pins' AND cue = 'Compound push movement targeting hamstrings. Barbell, Rack.';

-- Gorilla Chin/Crunch
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'gorilla-chin-crunch' AND cue = 'Compound pull movement targeting abs.';

-- Hack Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. hack_squat.'
WHERE slug = 'hack-squat' AND cue = 'Compound push movement targeting quads. Hack squat.';

-- Hammer Curls
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'hammer-curls' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Hammer Grip Incline DB Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Dumbbells, Bench.'
WHERE slug = 'hammer-grip-incline-db-bench-press' AND cue = 'Compound push movement targeting chest. Bench, Dumbbells.';

-- Handstand Push-Ups
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts.'
WHERE slug = 'handstand-push-ups' AND cue = 'Compound push movement targeting front delts, side delts.';

-- Hanging Bar Good Morning
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell, pull_up_bar, Rack.'
WHERE slug = 'hanging-bar-good-morning' AND cue = 'Compound push movement targeting hamstrings. Barbell, Pull-up bar, Rack.';

-- Hanging Leg Raise
UPDATE exercises SET cue = 'Isolation core movement targeting abs. pull_up_bar.'
WHERE slug = 'hanging-leg-raise' AND cue = 'Isolation pull movement targeting abs. Pull-up bar.';

-- Hanging Pike
UPDATE exercises SET cue = 'Compound core movement targeting abs. pull_up_bar.'
WHERE slug = 'hanging-pike' AND cue = 'Compound pull movement targeting abs. Pull-up bar.';

-- High Cable Curls
UPDATE exercises SET cue = 'Compound biceps movement targeting biceps. Cable machine.'
WHERE slug = 'high-cable-curls' AND cue = 'Compound pull movement targeting biceps. Cable machine.';

-- Hip Extension with Bands
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Bands.'
WHERE slug = 'hip-extension-with-bands' AND cue = 'Compound push movement targeting glutes. Bands.';

-- Hip Flexion with Band
UPDATE exercises SET cue = 'Isolation other movement targeting hip flexors. Bands.'
WHERE slug = 'hip-flexion-with-band' AND cue = 'Compound pull movement targeting quads. Bands.';

-- Hip Lift with Band
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Bands.'
WHERE slug = 'hip-lift-with-band' AND cue = 'Compound push movement targeting glutes. Bands.';

-- Hyperextensions With No Hyperextension Bench
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Bench.'
WHERE slug = 'hyperextensions-with-no-hyperextension-bench' AND cue = 'Compound pull movement targeting lower back. Bench.';

-- Incline Barbell Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. adjustable_bench, Barbell.'
WHERE slug = 'incline-barbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Bench, Barbell.';

-- Incline Bench Pull
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. adjustable_bench, Barbell, Bench.'
WHERE slug = 'incline-bench-pull' AND cue = 'Isolation pull movement targeting upper back. Bench, Barbell.';

-- Incline Cable Chest Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Cable machine.'
WHERE slug = 'incline-cable-chest-press' AND cue = 'Compound push movement targeting chest. Bench, Cable machine.';

-- Incline Cable Flye
UPDATE exercises SET cue = 'Isolation horizontal_press movement targeting chest. adjustable_bench, Cable machine.'
WHERE slug = 'incline-cable-flye' AND cue = 'Isolation push movement targeting chest. Bench, Cable machine.';

-- Incline Dumbbell Bench With Palms Facing In
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Dumbbells, Bench.'
WHERE slug = 'incline-dumbbell-bench-with-palms-facing-in' AND cue = 'Compound push movement targeting chest. Bench, Dumbbells.';

-- Incline Dumbbell Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. adjustable_bench, Dumbbells.'
WHERE slug = 'incline-dumbbell-curl' AND cue = 'Isolation pull movement targeting biceps. Bench, Dumbbells.';

-- Incline Dumbbell Flyes
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Dumbbells.'
WHERE slug = 'incline-dumbbell-flyes' AND cue = 'Compound push movement targeting chest. Bench, Dumbbells.';

-- Incline Dumbbell Flyes - With A Twist
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Dumbbells.'
WHERE slug = 'incline-dumbbell-flyes-with-a-twist' AND cue = 'Compound push movement targeting chest. Bench, Dumbbells.';

-- Incline Dumbbell Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Dumbbells.'
WHERE slug = 'incline-dumbbell-press' AND cue = 'Compound push movement targeting chest. Bench, Dumbbells.';

-- Incline Hammer Curls
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. adjustable_bench, Dumbbells.'
WHERE slug = 'incline-hammer-curls' AND cue = 'Isolation pull movement targeting biceps. Bench, Dumbbells.';

-- Incline Push-Up
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench.'
WHERE slug = 'incline-push-up' AND cue = 'Compound push movement targeting chest. Bench.';

-- Incline Push-Up Close-Grip
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting triceps. adjustable_bench.'
WHERE slug = 'incline-push-up-close-grip' AND cue = 'Compound push movement targeting triceps. Bench.';

-- Incline Push-Up Medium
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench.'
WHERE slug = 'incline-push-up-medium' AND cue = 'Compound push movement targeting chest. Bench.';

-- Incline Push-Up Reverse Grip
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench.'
WHERE slug = 'incline-push-up-reverse-grip' AND cue = 'Compound push movement targeting chest. Bench.';

-- Incline Push-Up Wide
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench.'
WHERE slug = 'incline-push-up-wide' AND cue = 'Compound push movement targeting chest. Bench.';

-- Inverted Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting lats. pull_up_bar.'
WHERE slug = 'inverted-row' AND cue = 'Compound pull movement targeting lats, upper back. Bodyweight.';

-- Iron Cross
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'iron-cross' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Isometric Wipers
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest.'
WHERE slug = 'isometric-wipers' AND cue = 'Compound push movement targeting chest.';

-- Jackknife Sit-Up
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'jackknife-sit-up' AND cue = 'Compound pull movement targeting abs.';

-- Janda Sit-Up
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'janda-sit-up' AND cue = 'Isolation pull movement targeting abs.';

-- Jefferson Squats
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell.'
WHERE slug = 'jefferson-squats' AND cue = 'Compound push movement targeting quads. Barbell.';

-- JM Press
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Barbell.'
WHERE slug = 'jm-press' AND cue = 'Compound push movement targeting triceps. Barbell.';

-- Kettlebell Arnold Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'kettlebell-arnold-press' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Kettlebell Dead Clean
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'kettlebell-dead-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Kettlebell Figure 8
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Kettlebell.'
WHERE slug = 'kettlebell-figure-8' AND cue = 'pull movement targeting abs. Kettlebell.';

-- Kettlebell Halo with Overhead Extension
UPDATE exercises SET cue = 'Compound triceps movement targeting front delts. Kettlebell.'
WHERE slug = 'kettlebell-halo-with-overhead-extension' AND cue = 'Compound push movement targeting front delts, side delts, triceps. Kettlebell.';

-- Kettlebell Hang Clean
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'kettlebell-hang-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Kettlebell One-Legged Deadlift
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'kettlebell-one-legged-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Kettlebell Overhead Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Kettlebell.'
WHERE slug = 'kettlebell-overhead-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Kettlebell.';

-- Kettlebell Pass Between The Legs
UPDATE exercises SET cue = 'Compound core movement targeting abs. Kettlebell.'
WHERE slug = 'kettlebell-pass-between-the-legs' AND cue = 'Compound pull movement targeting abs. Kettlebell.';

-- Kettlebell Pirate Ships
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting front delts. Kettlebell.'
WHERE slug = 'kettlebell-pirate-ships' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Kettlebell Pistol Squat
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Kettlebell.'
WHERE slug = 'kettlebell-pistol-squat' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- Kettlebell Seated Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'kettlebell-seated-press' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Kettlebell Seesaw Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'kettlebell-seesaw-press' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Kettlebell Sumo High Pull
UPDATE exercises SET cue = 'Compound other movement targeting traps. Kettlebell.'
WHERE slug = 'kettlebell-sumo-high-pull' AND cue = 'Compound pull movement targeting traps. Kettlebell.';

-- Kettlebell Thruster
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'kettlebell-thruster' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Kettlebell Turkish Get-Up (Lunge style)
UPDATE exercises SET cue = 'Compound lunge movement targeting front delts. Kettlebell.'
WHERE slug = 'kettlebell-turkish-get-up-lunge-style' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Kettlebell Turkish Get-Up (Squat style)
UPDATE exercises SET cue = 'Compound squat movement targeting front delts. Kettlebell.'
WHERE slug = 'kettlebell-turkish-get-up-squat-style' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Kettlebell Windmill
UPDATE exercises SET cue = 'Compound core movement targeting abs. Kettlebell.'
WHERE slug = 'kettlebell-windmill' AND cue = 'Compound pull movement targeting abs. Kettlebell.';

-- Knee Tuck Jump
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'knee-tuck-jump' AND cue = 'Compound push movement targeting hamstrings.';

-- Kneeling Cable Crunch With Alternating Oblique Twists
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'kneeling-cable-crunch-with-alternating-oblique-twists' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Kneeling Cable Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'kneeling-cable-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Kneeling High Pulley Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting lats. Cable machine.'
WHERE slug = 'kneeling-high-pulley-row' AND cue = 'Compound pull movement targeting lats. Cable machine.';

-- Kneeling Single-Arm High Pulley Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting lats. Cable machine.'
WHERE slug = 'kneeling-single-arm-high-pulley-row' AND cue = 'Compound pull movement targeting lats. Cable machine.';

-- Kneeling Squat
UPDATE exercises SET cue = 'Compound squat movement targeting glutes. Barbell, Rack.'
WHERE slug = 'kneeling-squat' AND cue = 'Compound push movement targeting glutes. Barbell, Rack.';

-- Landmine 180's
UPDATE exercises SET cue = 'Compound core movement targeting abs. Barbell.'
WHERE slug = 'landmine-180-s' AND cue = 'Compound pull movement targeting abs. Barbell.';

-- Landmine Linear Jammer
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Barbell.'
WHERE slug = 'landmine-linear-jammer' AND cue = 'Compound push movement targeting front delts, side delts. Barbell.';

-- Lateral Bound
UPDATE exercises SET cue = 'Compound other movement targeting adductors.'
WHERE slug = 'lateral-bound' AND cue = 'Compound push movement targeting adductors.';

-- Lateral Raise - With Bands
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Bands.'
WHERE slug = 'lateral-raise-with-bands' AND cue = 'Isolation push movement targeting side delts. Bands.';

-- Leg Lift
UPDATE exercises SET cue = 'Isolation hinge movement targeting glutes.'
WHERE slug = 'leg-lift' AND cue = 'Isolation push movement targeting glutes.';

-- Leg-Over Floor Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Kettlebell.'
WHERE slug = 'leg-over-floor-press' AND cue = 'Compound push movement targeting chest. Kettlebell.';

-- Leg Press
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Leg press.'
WHERE slug = 'leg-press' AND cue = 'Compound push movement targeting quads. Leg press.';

-- Leg Pull-In
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'leg-pull-in' AND cue = 'Compound pull movement targeting abs.';

-- Leverage Chest Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. chest_press_machine.'
WHERE slug = 'leverage-chest-press' AND cue = 'Compound push movement targeting chest. Chest press.';

-- Leverage Deadlift
UPDATE exercises SET cue = 'Compound hinge movement targeting quads. Machine.'
WHERE slug = 'leverage-deadlift' AND cue = 'Compound pull movement targeting quads. Machine.';

-- Leverage Decline Chest Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, chest_press_machine.'
WHERE slug = 'leverage-decline-chest-press' AND cue = 'Compound push movement targeting chest. Bench, Chest press.';

-- Leverage High Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Machine.'
WHERE slug = 'leverage-high-row' AND cue = 'Compound pull movement targeting upper back. Machine.';

-- Leverage Incline Chest Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, chest_press_machine.'
WHERE slug = 'leverage-incline-chest-press' AND cue = 'Compound push movement targeting chest. Bench, Chest press.';

-- Leverage Iso Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting lats. Machine.'
WHERE slug = 'leverage-iso-row' AND cue = 'Compound pull movement targeting lats. Machine.';

-- Leverage Shoulder Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Machine.'
WHERE slug = 'leverage-shoulder-press' AND cue = 'Compound push movement targeting front delts, side delts. Machine.';

-- Leverage Shrug
UPDATE exercises SET cue = 'Isolation other movement targeting traps. Machine.'
WHERE slug = 'leverage-shrug' AND cue = 'Isolation pull movement targeting traps. Machine.';

-- Low Cable Crossover
UPDATE exercises SET cue = 'Isolation horizontal_press movement targeting chest. Cable machine.'
WHERE slug = 'low-cable-crossover' AND cue = 'Isolation push movement targeting chest. Cable machine.';

-- Low Cable Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'low-cable-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Low Pulley Row To Neck
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting front delts. Cable machine.'
WHERE slug = 'low-pulley-row-to-neck' AND cue = 'Compound pull movement targeting front delts, side delts. Cable machine.';

-- Lunge Pass Through
UPDATE exercises SET cue = 'Compound lunge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'lunge-pass-through' AND cue = 'Compound push movement targeting hamstrings. Kettlebell.';

-- Lunge Sprint
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Machine.'
WHERE slug = 'lunge-sprint' AND cue = 'Compound push movement targeting quads. Machine.';

-- Lying Cable Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Cable machine, Bench.'
WHERE slug = 'lying-cable-curl' AND cue = 'Isolation pull movement targeting biceps. Cable machine, Bench.';

-- Lying Cambered Barbell Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Barbell, Bench.'
WHERE slug = 'lying-cambered-barbell-row' AND cue = 'Compound pull movement targeting lats, upper back. Barbell.';

-- Lying Close-Grip Bar Curl On High Pulley
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Cable machine, Bench.'
WHERE slug = 'lying-close-grip-bar-curl-on-high-pulley' AND cue = 'Isolation pull movement targeting biceps. Cable machine, Bench.';

-- Lying Close-Grip Barbell Triceps Extension Behind The Head
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Barbell, Bench.'
WHERE slug = 'lying-close-grip-barbell-triceps-extension-behind-the-head' AND cue = 'Isolation push movement targeting triceps. Barbell, Bench.';

-- Lying Close-Grip Barbell Triceps Press To Chin
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. ez_bar, Bench.'
WHERE slug = 'lying-close-grip-barbell-triceps-press-to-chin' AND cue = 'Isolation push movement targeting triceps. EZ bar, Bench.';

-- Lying Dumbbell Tricep Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells, Bench.'
WHERE slug = 'lying-dumbbell-tricep-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells, Bench.';

-- Lying High Bench Barbell Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Barbell, Bench.'
WHERE slug = 'lying-high-bench-barbell-curl' AND cue = 'Isolation pull movement targeting biceps. Barbell, Bench.';

-- Lying Leg Curls
UPDATE exercises SET cue = 'Isolation hinge movement targeting hamstrings. Bench, Leg curl.'
WHERE slug = 'lying-leg-curls' AND cue = 'Isolation pull movement targeting hamstrings. Bench, Leg curl.';

-- Lying Machine Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Bench, Machine.'
WHERE slug = 'lying-machine-squat' AND cue = 'Compound push movement targeting quads. Bench, Machine.';

-- Lying One-Arm Lateral Raise
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Dumbbells, Bench.'
WHERE slug = 'lying-one-arm-lateral-raise' AND cue = 'Isolation pull movement targeting side delts. Dumbbells, Bench.';

-- Lying Rear Delt Raise
UPDATE exercises SET cue = 'Isolation rear_delt movement targeting rear delts. Dumbbells, Bench.'
WHERE slug = 'lying-rear-delt-raise' AND cue = 'Isolation pull movement targeting rear delts. Dumbbells, Bench.';

-- Lying Supine Dumbbell Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells, Bench.'
WHERE slug = 'lying-supine-dumbbell-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells, Bench.';

-- Lying T-Bar Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Bench, Machine.'
WHERE slug = 'lying-t-bar-row' AND cue = 'Compound pull movement targeting upper back. Bench, Machine.';

-- Lying Triceps Press
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. ez_bar, Bench.'
WHERE slug = 'lying-triceps-press' AND cue = 'Isolation push movement targeting triceps. EZ bar, Bench.';

-- Machine Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Bench, Machine.'
WHERE slug = 'machine-bench-press' AND cue = 'Compound push movement targeting chest. Bench, Machine.';

-- Machine Bicep Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Machine.'
WHERE slug = 'machine-bicep-curl' AND cue = 'Isolation pull movement targeting biceps. Machine.';

-- Machine Preacher Curls
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Machine.'
WHERE slug = 'machine-preacher-curls' AND cue = 'Isolation pull movement targeting biceps. Machine.';

-- Machine Shoulder (Military) Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Machine.'
WHERE slug = 'machine-shoulder-military-press' AND cue = 'Compound push movement targeting front delts, side delts. Machine.';

-- Machine Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Machine.'
WHERE slug = 'machine-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Machine.';

-- Medicine Ball Chest Pass
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Medicine ball.'
WHERE slug = 'medicine-ball-chest-pass' AND cue = 'Compound push movement targeting chest. Medicine ball.';

-- Medicine Ball Full Twist
UPDATE exercises SET cue = 'Compound core movement targeting abs. Medicine ball.'
WHERE slug = 'medicine-ball-full-twist' AND cue = 'Compound pull movement targeting abs. Medicine ball.';

-- Medicine Ball Scoop Throw
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Medicine ball.'
WHERE slug = 'medicine-ball-scoop-throw' AND cue = 'Compound push movement targeting front delts, side delts. Medicine ball.';

-- Middle Back Shrug
UPDATE exercises SET cue = 'Isolation other movement targeting upper back. Dumbbells.'
WHERE slug = 'middle-back-shrug' AND cue = 'Isolation pull movement targeting upper back. Dumbbells.';

-- Monster Walk
UPDATE exercises SET cue = 'Compound other movement targeting abductors. Bands.'
WHERE slug = 'monster-walk' AND cue = 'Compound pull movement targeting abductors. Bands.';

-- Narrow Stance Hack Squats
UPDATE exercises SET cue = 'Compound squat movement targeting quads. hack_squat.'
WHERE slug = 'narrow-stance-hack-squats' AND cue = 'Compound push movement targeting quads. Hack squat.';

-- Narrow Stance Leg Press
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Leg press.'
WHERE slug = 'narrow-stance-leg-press' AND cue = 'Compound push movement targeting quads. Leg press.';

-- Narrow Stance Squats
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell.'
WHERE slug = 'narrow-stance-squats' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Natural Glute Ham Raise
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings.'
WHERE slug = 'natural-glute-ham-raise' AND cue = 'Compound pull movement targeting hamstrings.';

-- Neck Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Barbell.'
WHERE slug = 'neck-press' AND cue = 'Compound push movement targeting chest. Barbell.';

-- Oblique Crunches
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'oblique-crunches' AND cue = 'Isolation pull movement targeting abs.';

-- Oblique Crunches - On The Floor
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'oblique-crunches-on-the-floor' AND cue = 'Isolation pull movement targeting abs.';

-- One Arm Dumbbell Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Dumbbells, Bench.'
WHERE slug = 'one-arm-dumbbell-bench-press' AND cue = 'Compound push movement targeting chest. Dumbbells, Bench.';

-- One Arm Dumbbell Preacher Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'one-arm-dumbbell-preacher-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- One-Arm Dumbbell Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Dumbbells.'
WHERE slug = 'one-arm-dumbbell-row' AND cue = 'Compound pull movement targeting upper back. Dumbbells.';

-- One-Arm Flat Bench Dumbbell Flye
UPDATE exercises SET cue = 'Isolation horizontal_press movement targeting chest. Dumbbells, Bench.'
WHERE slug = 'one-arm-flat-bench-dumbbell-flye' AND cue = 'Isolation push movement targeting chest. Dumbbells, Bench.';

-- One Arm Floor Press
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Barbell.'
WHERE slug = 'one-arm-floor-press' AND cue = 'Compound push movement targeting triceps. Barbell.';

-- One-Arm High-Pulley Cable Side Bends
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'one-arm-high-pulley-cable-side-bends' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- One-Arm Incline Lateral Raise
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. adjustable_bench, Dumbbells.'
WHERE slug = 'one-arm-incline-lateral-raise' AND cue = 'Isolation push movement targeting side delts. Bench, Dumbbells.';

-- One-Arm Kettlebell Clean
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- One-Arm Kettlebell Clean and Jerk
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-clean-and-jerk' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- One-Arm Kettlebell Floor Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-floor-press' AND cue = 'Compound push movement targeting chest. Kettlebell.';

-- One-Arm Kettlebell Jerk
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-jerk' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- One-Arm Kettlebell Military Press To The Side
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-military-press-to-the-side' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- One-Arm Kettlebell Para Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-para-press' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- One-Arm Kettlebell Push Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-push-press' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- One-Arm Kettlebell Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-row' AND cue = 'Compound pull movement targeting upper back. Kettlebell.';

-- One-Arm Kettlebell Split Jerk
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-split-jerk' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- One-Arm Kettlebell Swings
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-swings' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- One Arm Lat Pulldown
UPDATE exercises SET cue = 'Compound vertical_pull movement targeting lats. Cable machine.'
WHERE slug = 'one-arm-lat-pulldown' AND cue = 'Compound pull movement targeting lats. Cable machine.';

-- One-Arm Long Bar Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Barbell.'
WHERE slug = 'one-arm-long-bar-row' AND cue = 'Compound pull movement targeting upper back. Barbell.';

-- One-Arm Medicine Ball Slam
UPDATE exercises SET cue = 'Compound core movement targeting abs. Medicine ball.'
WHERE slug = 'one-arm-medicine-ball-slam' AND cue = 'Compound pull movement targeting abs. Medicine ball.';

-- One-Arm Open Palm Kettlebell Clean
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'one-arm-open-palm-kettlebell-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- One-Arm Overhead Kettlebell Squats
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Kettlebell.'
WHERE slug = 'one-arm-overhead-kettlebell-squats' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- One Arm Pronated Dumbbell Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'one-arm-pronated-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- One-Arm Side Deadlift
UPDATE exercises SET cue = 'Compound hinge movement targeting quads. Barbell.'
WHERE slug = 'one-arm-side-deadlift' AND cue = 'Compound pull movement targeting quads. Barbell.';

-- One-Arm Side Laterals
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Dumbbells.'
WHERE slug = 'one-arm-side-laterals' AND cue = 'Isolation push movement targeting side delts. Dumbbells.';

-- One Arm Supinated Dumbbell Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'one-arm-supinated-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- One Leg Barbell Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'one-leg-barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- One-Legged Cable Kickback
UPDATE exercises SET cue = 'Isolation hinge movement targeting glutes. Cable machine.'
WHERE slug = 'one-legged-cable-kickback' AND cue = 'Isolation push movement targeting glutes. Cable machine.';

-- Open Palm Kettlebell Clean
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'open-palm-kettlebell-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Overhead Cable Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Cable machine.'
WHERE slug = 'overhead-cable-curl' AND cue = 'Isolation pull movement targeting biceps. Cable machine.';

-- Pallof Press
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'pallof-press' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Pallof Press With Rotation
UPDATE exercises SET cue = 'Compound core movement targeting abs. Cable machine.'
WHERE slug = 'pallof-press-with-rotation' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Palms-Down Dumbbell Wrist Curl Over A Bench
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Dumbbells, Bench.'
WHERE slug = 'palms-down-dumbbell-wrist-curl-over-a-bench' AND cue = 'Isolation pull movement targeting forearms. Dumbbells, Bench.';

-- Palms-Down Wrist Curl Over A Bench
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Barbell, Bench.'
WHERE slug = 'palms-down-wrist-curl-over-a-bench' AND cue = 'Isolation pull movement targeting forearms. Barbell, Bench.';

-- Palms-Up Barbell Wrist Curl Over A Bench
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Barbell, Bench.'
WHERE slug = 'palms-up-barbell-wrist-curl-over-a-bench' AND cue = 'Isolation pull movement targeting forearms. Barbell, Bench.';

-- Palms-Up Dumbbell Wrist Curl Over A Bench
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Dumbbells, Bench.'
WHERE slug = 'palms-up-dumbbell-wrist-curl-over-a-bench' AND cue = 'Isolation pull movement targeting forearms. Dumbbells, Bench.';

-- Physioball Hip Bridge
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. stability_ball.'
WHERE slug = 'physioball-hip-bridge' AND cue = 'Compound push movement targeting glutes. Stability ball.';

-- Pike Push-Up
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts.'
WHERE slug = 'pike-push-up' AND cue = 'Compound push movement targeting front delts, side delts. Bodyweight.';

-- Pin Presses
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Barbell.'
WHERE slug = 'pin-presses' AND cue = 'Compound push movement targeting triceps. Barbell.';

-- Plie Dumbbell Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Dumbbells.'
WHERE slug = 'plie-dumbbell-squat' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Plyo Kettlebell Pushups
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Kettlebell.'
WHERE slug = 'plyo-kettlebell-pushups' AND cue = 'Compound push movement targeting chest. Kettlebell.';

-- Plyo Push-up
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest.'
WHERE slug = 'plyo-push-up' AND cue = 'Compound push movement targeting chest.';

-- Power Clean
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'power-clean' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Power Partials
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'power-partials' AND cue = 'Isolation push movement targeting front delts, side delts. Dumbbells.';

-- Preacher Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Barbell.'
WHERE slug = 'preacher-curl' AND cue = 'Isolation pull movement targeting biceps. Barbell.';

-- Preacher Hammer Dumbbell Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'preacher-hammer-dumbbell-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Press Sit-Up
UPDATE exercises SET cue = 'Compound core movement targeting abs. Barbell.'
WHERE slug = 'press-sit-up' AND cue = 'Compound push movement targeting abs. Barbell.';

-- Pull Through
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Cable machine.'
WHERE slug = 'pull-through' AND cue = 'Compound pull movement targeting glutes. Cable machine.';

-- Pullups
UPDATE exercises SET cue = 'Compound vertical_pull movement targeting lats. pull_up_bar.'
WHERE slug = 'pullups' AND cue = 'Compound pull movement targeting lats. Pull-up bar.';

-- Push Up to Side Plank
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest.'
WHERE slug = 'push-up-to-side-plank' AND cue = 'Compound push movement targeting chest.';

-- Push-Ups - Close Triceps Position
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting triceps.'
WHERE slug = 'push-ups-close-triceps-position' AND cue = 'Compound push movement targeting triceps.';

-- Push-Ups With Feet Elevated
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest.'
WHERE slug = 'push-ups-with-feet-elevated' AND cue = 'Compound push movement targeting chest.';

-- Push-Ups With Feet On An Exercise Ball
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. stability_ball.'
WHERE slug = 'push-ups-with-feet-on-an-exercise-ball' AND cue = 'Compound push movement targeting chest. Stability ball.';

-- Pushups
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest.'
WHERE slug = 'pushups' AND cue = 'Compound push movement targeting chest.';

-- Pushups (Close and Wide Hand Positions)
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest.'
WHERE slug = 'pushups-close-and-wide-hand-positions' AND cue = 'Compound push movement targeting chest.';

-- Rack Pull with Bands
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'rack-pull-with-bands' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Rack Pulls
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'rack-pulls' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Return Push from Stance
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Medicine ball.'
WHERE slug = 'return-push-from-stance' AND cue = 'Compound push movement targeting front delts, side delts. Medicine ball.';

-- Reverse Band Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting triceps. Barbell, Bench.'
WHERE slug = 'reverse-band-bench-press' AND cue = 'Compound push movement targeting triceps. Barbell, Bench.';

-- Reverse Band Box Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'reverse-band-box-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Reverse Band Deadlift
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'reverse-band-deadlift' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Reverse Band Power Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'reverse-band-power-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Reverse Band Sumo Deadlift
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Barbell.'
WHERE slug = 'reverse-band-sumo-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Reverse Barbell Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Barbell.'
WHERE slug = 'reverse-barbell-curl' AND cue = 'Isolation pull movement targeting biceps. Barbell.';

-- Reverse Barbell Preacher Curls
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. ez_bar.'
WHERE slug = 'reverse-barbell-preacher-curls' AND cue = 'Isolation pull movement targeting biceps. EZ bar.';

-- Reverse Cable Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Cable machine.'
WHERE slug = 'reverse-cable-curl' AND cue = 'Isolation pull movement targeting biceps. Cable machine.';

-- Reverse Crunch
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'reverse-crunch' AND cue = 'Isolation pull movement targeting abs.';

-- Reverse Flyes
UPDATE exercises SET cue = 'Isolation rear_delt movement targeting rear delts. Dumbbells.'
WHERE slug = 'reverse-flyes' AND cue = 'Isolation pull movement targeting rear delts. Dumbbells.';

-- Reverse Flyes With External Rotation
UPDATE exercises SET cue = 'Isolation rear_delt movement targeting rear delts. Dumbbells.'
WHERE slug = 'reverse-flyes-with-external-rotation' AND cue = 'Isolation pull movement targeting rear delts. Dumbbells.';

-- Reverse Grip Bent-Over Rows
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Barbell.'
WHERE slug = 'reverse-grip-bent-over-rows' AND cue = 'Compound pull movement targeting upper back. Barbell.';

-- Reverse Grip Triceps Pushdown
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'reverse-grip-triceps-pushdown' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Reverse Hyperextension
UPDATE exercises SET cue = 'Isolation hinge movement targeting hamstrings. Machine.'
WHERE slug = 'reverse-hyperextension' AND cue = 'pull movement targeting hamstrings. Machine.';

-- Reverse Machine Flyes
UPDATE exercises SET cue = 'Isolation rear_delt movement targeting rear delts. Machine.'
WHERE slug = 'reverse-machine-flyes' AND cue = 'Isolation pull movement targeting rear delts. Machine.';

-- Reverse Triceps Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting triceps. Barbell, Bench.'
WHERE slug = 'reverse-triceps-bench-press' AND cue = 'Compound push movement targeting triceps. Barbell, Bench.';

-- Rocket Jump
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'rocket-jump' AND cue = 'Compound push movement targeting quads.';

-- Rocking Standing Calf Raise
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Barbell.'
WHERE slug = 'rocking-standing-calf-raise' AND cue = 'Isolation push movement targeting calves. Barbell.';

-- Romanian Deadlift
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'romanian-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Rope Crunch
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'rope-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Rope Straight-Arm Pulldown
UPDATE exercises SET cue = 'Isolation vertical_pull movement targeting lats. Cable machine.'
WHERE slug = 'rope-straight-arm-pulldown' AND cue = 'Isolation pull movement targeting lats. Cable machine.';

-- Russian Twist
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'russian-twist' AND cue = 'Compound pull movement targeting abs.';

-- Scissors Jump
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'scissors-jump' AND cue = 'Compound push movement targeting quads.';

-- Seated Barbell Military Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Barbell.'
WHERE slug = 'seated-barbell-military-press' AND cue = 'Compound push movement targeting front delts, side delts. Barbell.';

-- Seated Barbell Twist
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Barbell.'
WHERE slug = 'seated-barbell-twist' AND cue = 'Isolation pull movement targeting abs. Barbell.';

-- Seated Bent-Over One-Arm Dumbbell Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'seated-bent-over-one-arm-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Seated Bent-Over Rear Delt Raise
UPDATE exercises SET cue = 'Isolation rear_delt movement targeting rear delts. Dumbbells.'
WHERE slug = 'seated-bent-over-rear-delt-raise' AND cue = 'Isolation pull movement targeting rear delts. Dumbbells.';

-- Seated Bent-Over Two-Arm Dumbbell Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'seated-bent-over-two-arm-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Seated Cable Rows
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Cable machine.'
WHERE slug = 'seated-cable-rows' AND cue = 'Compound pull movement targeting upper back. Cable machine.';

-- Seated Cable Shoulder Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Cable machine.'
WHERE slug = 'seated-cable-shoulder-press' AND cue = 'Compound push movement targeting front delts, side delts. Cable machine.';

-- Seated Calf Raise
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Machine.'
WHERE slug = 'seated-calf-raise' AND cue = 'Isolation push movement targeting calves. Machine.';

-- Seated Close-Grip Concentration Barbell Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Barbell.'
WHERE slug = 'seated-close-grip-concentration-barbell-curl' AND cue = 'Isolation pull movement targeting biceps. Barbell.';

-- Seated Dumbbell Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'seated-dumbbell-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Seated Dumbbell Inner Biceps Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'seated-dumbbell-inner-biceps-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Seated Dumbbell Palms-Down Wrist Curl
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Dumbbells.'
WHERE slug = 'seated-dumbbell-palms-down-wrist-curl' AND cue = 'Isolation pull movement targeting forearms. Dumbbells.';

-- Seated Dumbbell Palms-Up Wrist Curl
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Dumbbells.'
WHERE slug = 'seated-dumbbell-palms-up-wrist-curl' AND cue = 'Isolation pull movement targeting forearms. Dumbbells.';

-- Seated Dumbbell Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'seated-dumbbell-press' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Seated Flat Bench Leg Pull-In
UPDATE exercises SET cue = 'Compound core movement targeting abs. Bench.'
WHERE slug = 'seated-flat-bench-leg-pull-in' AND cue = 'Compound pull movement targeting abs. Bench.';

-- Seated Good Mornings
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'seated-good-mornings' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Seated Leg Curl
UPDATE exercises SET cue = 'Isolation hinge movement targeting hamstrings. Leg curl.'
WHERE slug = 'seated-leg-curl' AND cue = 'Isolation pull movement targeting hamstrings. Leg curl.';

-- Seated Leg Tucks
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'seated-leg-tucks' AND cue = 'Isolation pull movement targeting abs.';

-- Seated One-arm Cable Pulley Rows
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Cable machine.'
WHERE slug = 'seated-one-arm-cable-pulley-rows' AND cue = 'Compound pull movement targeting upper back. Cable machine.';

-- Seated One-Arm Dumbbell Palms-Down Wrist Curl
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Dumbbells.'
WHERE slug = 'seated-one-arm-dumbbell-palms-down-wrist-curl' AND cue = 'Isolation pull movement targeting forearms. Dumbbells.';

-- Seated One-Arm Dumbbell Palms-Up Wrist Curl
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Dumbbells.'
WHERE slug = 'seated-one-arm-dumbbell-palms-up-wrist-curl' AND cue = 'Isolation pull movement targeting forearms. Dumbbells.';

-- Seated Palm-Up Barbell Wrist Curl
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Barbell.'
WHERE slug = 'seated-palm-up-barbell-wrist-curl' AND cue = 'Isolation pull movement targeting forearms. Barbell.';

-- Seated Palms-Down Barbell Wrist Curl
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Barbell.'
WHERE slug = 'seated-palms-down-barbell-wrist-curl' AND cue = 'Isolation pull movement targeting forearms. Barbell.';

-- Seated Side Lateral Raise
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Dumbbells.'
WHERE slug = 'seated-side-lateral-raise' AND cue = 'Isolation push movement targeting side delts. Dumbbells.';

-- Seated Triceps Press
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'seated-triceps-press' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Seated Two-Arm Palms-Up Low-Pulley Wrist Curl
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Cable machine.'
WHERE slug = 'seated-two-arm-palms-up-low-pulley-wrist-curl' AND cue = 'Isolation pull movement targeting forearms. Cable machine.';

-- See-Saw Press (Alternating Side Press)
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'see-saw-press-alternating-side-press' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Shotgun Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting lats. Cable machine.'
WHERE slug = 'shotgun-row' AND cue = 'Compound pull movement targeting lats. Cable machine.';

-- Shoulder Press - With Bands
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Bands.'
WHERE slug = 'shoulder-press-with-bands' AND cue = 'Compound push movement targeting front delts, side delts. Bands.';

-- Side Jackknife
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'side-jackknife' AND cue = 'Compound pull movement targeting abs.';

-- Side Lateral Raise
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Dumbbells.'
WHERE slug = 'side-lateral-raise' AND cue = 'Isolation push movement targeting side delts. Dumbbells.';

-- Side Laterals to Front Raise
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Dumbbells.'
WHERE slug = 'side-laterals-to-front-raise' AND cue = 'Isolation push movement targeting side delts. Dumbbells.';

-- Single-Arm Cable Crossover
UPDATE exercises SET cue = 'Isolation horizontal_press movement targeting chest. Cable machine.'
WHERE slug = 'single-arm-cable-crossover' AND cue = 'Isolation push movement targeting chest. Cable machine.';

-- Single-Arm Linear Jammer
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Barbell.'
WHERE slug = 'single-arm-linear-jammer' AND cue = 'Compound push movement targeting front delts, side delts. Barbell.';

-- Single-Arm Push-Up
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest.'
WHERE slug = 'single-arm-push-up' AND cue = 'Compound push movement targeting chest.';

-- Single Leg Glute Bridge
UPDATE exercises SET cue = 'Isolation hinge movement targeting glutes.'
WHERE slug = 'single-leg-glute-bridge' AND cue = 'Isolation push movement targeting glutes.';

-- Sit-Up
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'sit-up' AND cue = 'Isolation pull movement targeting abs.';

-- Smith Incline Shoulder Raise
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. adjustable_bench, Barbell.'
WHERE slug = 'smith-incline-shoulder-raise' AND cue = 'Isolation push movement targeting front delts, side delts. Bench, Barbell.';

-- Smith Machine Behind the Back Shrug
UPDATE exercises SET cue = 'Isolation other movement targeting traps. Smith machine.'
WHERE slug = 'smith-machine-behind-the-back-shrug' AND cue = 'Isolation pull movement targeting traps. Smith machine.';

-- Smith Machine Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Bench, Smith machine.'
WHERE slug = 'smith-machine-bench-press' AND cue = 'Compound push movement targeting chest. Bench, Smith machine.';

-- Smith Machine Bent Over Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Smith machine.'
WHERE slug = 'smith-machine-bent-over-row' AND cue = 'Compound pull movement targeting upper back. Smith machine.';

-- Smith Machine Calf Raise
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Smith machine.'
WHERE slug = 'smith-machine-calf-raise' AND cue = 'Isolation push movement targeting calves. Smith machine.';

-- Smith Machine Close-Grip Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting triceps. Bench, Smith machine.'
WHERE slug = 'smith-machine-close-grip-bench-press' AND cue = 'Compound push movement targeting triceps. Bench, Smith machine.';

-- Smith Machine Hang Power Clean
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Smith machine.'
WHERE slug = 'smith-machine-hang-power-clean' AND cue = 'Compound pull movement targeting hamstrings. Smith machine.';

-- Smith Machine Hip Raise
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Smith machine.'
WHERE slug = 'smith-machine-hip-raise' AND cue = 'Isolation pull movement targeting abs. Smith machine.';

-- Smith Machine Incline Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Bench, Smith machine.'
WHERE slug = 'smith-machine-incline-bench-press' AND cue = 'Compound push movement targeting chest. Bench, Smith machine.';

-- Smith Machine Leg Press
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Leg press.'
WHERE slug = 'smith-machine-leg-press' AND cue = 'Compound push movement targeting quads. Leg press.';

-- Smith Machine One-Arm Upright Row
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Smith machine.'
WHERE slug = 'smith-machine-one-arm-upright-row' AND cue = 'Compound pull movement targeting side delts, traps. Smith machine.';

-- Smith Machine Overhead Shoulder Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Smith machine.'
WHERE slug = 'smith-machine-overhead-shoulder-press' AND cue = 'Compound push movement targeting front delts, side delts. Smith machine.';

-- Smith Machine Pistol Squat
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Smith machine.'
WHERE slug = 'smith-machine-pistol-squat' AND cue = 'Compound push movement targeting quads. Smith machine.';

-- Smith Machine Reverse Calf Raises
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Smith machine.'
WHERE slug = 'smith-machine-reverse-calf-raises' AND cue = 'Isolation push movement targeting calves. Smith machine.';

-- Smith Machine Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Smith machine.'
WHERE slug = 'smith-machine-squat' AND cue = 'Compound push movement targeting quads. Smith machine.';

-- Smith Machine Stiff-Legged Deadlift
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Smith machine.'
WHERE slug = 'smith-machine-stiff-legged-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Smith machine.';

-- Smith Machine Upright Row
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Smith machine.'
WHERE slug = 'smith-machine-upright-row' AND cue = 'Compound pull movement targeting traps. Smith machine.';

-- Smith Single-Leg Split Squat
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Smith machine.'
WHERE slug = 'smith-single-leg-split-squat' AND cue = 'Compound push movement targeting quads. Smith machine.';

-- Snatch Pull
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'snatch-pull' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Speed Band Overhead Triceps
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Bands.'
WHERE slug = 'speed-band-overhead-triceps' AND cue = 'Isolation push movement targeting triceps. Bands.';

-- Speed Box Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'speed-box-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Speed Squats
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell.'
WHERE slug = 'speed-squats' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Spell Caster
UPDATE exercises SET cue = 'Compound core movement targeting abs. Dumbbells.'
WHERE slug = 'spell-caster' AND cue = 'Compound pull movement targeting abs. Dumbbells.';

-- Spider Crawl
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'spider-crawl' AND cue = 'Compound pull movement targeting abs.';

-- Spider Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. ez_bar.'
WHERE slug = 'spider-curl' AND cue = 'Isolation pull movement targeting biceps. EZ bar.';

-- Split Jump
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'split-jump' AND cue = 'Compound push movement targeting quads.';

-- Split Squat with Dumbbells
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Dumbbells.'
WHERE slug = 'split-squat-with-dumbbells' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Squat Jerk
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'squat-jerk' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squat with Bands
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'squat-with-bands' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squat with Chains
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'squat-with-chains' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squat with Plate Movers
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'squat-with-plate-movers' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squats - With Bands
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Bands.'
WHERE slug = 'squats-with-bands' AND cue = 'Compound push movement targeting quads. Bands.';

-- Standing Alternating Dumbbell Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'standing-alternating-dumbbell-press' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Standing Barbell Calf Raise
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Barbell.'
WHERE slug = 'standing-barbell-calf-raise' AND cue = 'Isolation push movement targeting calves. Barbell.';

-- Standing Barbell Press Behind Neck
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Barbell.'
WHERE slug = 'standing-barbell-press-behind-neck' AND cue = 'Compound push movement targeting front delts, side delts. Barbell.';

-- Standing Bent-Over One-Arm Dumbbell Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'standing-bent-over-one-arm-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Standing Bent-Over Two-Arm Dumbbell Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'standing-bent-over-two-arm-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Standing Biceps Cable Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Cable machine.'
WHERE slug = 'standing-biceps-cable-curl' AND cue = 'Isolation pull movement targeting biceps. Cable machine.';

-- Standing Bradford Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Barbell.'
WHERE slug = 'standing-bradford-press' AND cue = 'Compound push movement targeting front delts, side delts. Barbell.';

-- Standing Cable Chest Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Cable machine.'
WHERE slug = 'standing-cable-chest-press' AND cue = 'Compound push movement targeting chest. Cable machine.';

-- Standing Cable Lift
UPDATE exercises SET cue = 'Compound core movement targeting abs. Cable machine.'
WHERE slug = 'standing-cable-lift' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Standing Cable Wood Chop
UPDATE exercises SET cue = 'Compound core movement targeting abs. Cable machine.'
WHERE slug = 'standing-cable-wood-chop' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Standing Calf Raises
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Machine.'
WHERE slug = 'standing-calf-raises' AND cue = 'Isolation push movement targeting calves. Machine.';

-- Standing Concentration Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'standing-concentration-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Standing Dumbbell Calf Raise
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Dumbbells.'
WHERE slug = 'standing-dumbbell-calf-raise' AND cue = 'Isolation push movement targeting calves. Dumbbells.';

-- Standing Dumbbell Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'standing-dumbbell-press' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Standing Dumbbell Reverse Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'standing-dumbbell-reverse-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Standing Dumbbell Straight-Arm Front Delt Raise Above Head
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'standing-dumbbell-straight-arm-front-delt-raise-above-head' AND cue = 'Isolation push movement targeting front delts, side delts. Dumbbells.';

-- Standing Dumbbell Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'standing-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Standing Dumbbell Upright Row
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Dumbbells.'
WHERE slug = 'standing-dumbbell-upright-row' AND cue = 'Compound pull movement targeting traps. Dumbbells.';

-- Standing Front Barbell Raise Over Head
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. Barbell.'
WHERE slug = 'standing-front-barbell-raise-over-head' AND cue = 'Isolation push movement targeting front delts, side delts. Barbell.';

-- Standing Inner-Biceps Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'standing-inner-biceps-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Standing Leg Curl
UPDATE exercises SET cue = 'Isolation hinge movement targeting hamstrings. Leg curl.'
WHERE slug = 'standing-leg-curl' AND cue = 'Isolation pull movement targeting hamstrings. Leg curl.';

-- Standing Long Jump
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'standing-long-jump' AND cue = 'Compound push movement targeting quads.';

-- Standing Low-Pulley Deltoid Raise
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. Cable machine.'
WHERE slug = 'standing-low-pulley-deltoid-raise' AND cue = 'Isolation push movement targeting front delts, side delts. Cable machine.';

-- Standing Low-Pulley One-Arm Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'standing-low-pulley-one-arm-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Standing Military Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Barbell.'
WHERE slug = 'standing-military-press' AND cue = 'Compound push movement targeting front delts, side delts. Barbell.';

-- Standing One-Arm Cable Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Cable machine.'
WHERE slug = 'standing-one-arm-cable-curl' AND cue = 'Isolation pull movement targeting biceps. Cable machine.';

-- Standing One-Arm Dumbbell Curl Over Incline Bench
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. adjustable_bench, Dumbbells, Bench.'
WHERE slug = 'standing-one-arm-dumbbell-curl-over-incline-bench' AND cue = 'Isolation pull movement targeting biceps. Bench, Dumbbells.';

-- Standing One-Arm Dumbbell Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'standing-one-arm-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Standing Overhead Barbell Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Barbell.'
WHERE slug = 'standing-overhead-barbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Barbell.';

-- Standing Palm-In One-Arm Dumbbell Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'standing-palm-in-one-arm-dumbbell-press' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Standing Palms-In Dumbbell Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Dumbbells.'
WHERE slug = 'standing-palms-in-dumbbell-press' AND cue = 'Compound push movement targeting front delts, side delts. Dumbbells.';

-- Standing Palms-Up Barbell Behind The Back Wrist Curl
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Barbell.'
WHERE slug = 'standing-palms-up-barbell-behind-the-back-wrist-curl' AND cue = 'Isolation pull movement targeting forearms. Barbell.';

-- Standing Rope Crunch
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'standing-rope-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Standing Towel Triceps Extension
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps.'
WHERE slug = 'standing-towel-triceps-extension' AND cue = 'Isolation push movement targeting triceps.';

-- Star Jump
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'star-jump' AND cue = 'Compound push movement targeting quads.';

-- Step-up with Knee Raise
UPDATE exercises SET cue = 'Compound lunge movement targeting glutes.'
WHERE slug = 'step-up-with-knee-raise' AND cue = 'Compound push movement targeting glutes.';

-- Stiff Leg Barbell Good Morning
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell, Rack.'
WHERE slug = 'stiff-leg-barbell-good-morning' AND cue = 'Compound push movement targeting lower back. Barbell, Rack.';

-- Stiff-Legged Barbell Deadlift
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'stiff-legged-barbell-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Stiff-Legged Dumbbell Deadlift
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Dumbbells.'
WHERE slug = 'stiff-legged-dumbbell-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Dumbbells.';

-- Straight-Arm Pulldown
UPDATE exercises SET cue = 'Isolation vertical_pull movement targeting lats. Cable machine.'
WHERE slug = 'straight-arm-pulldown' AND cue = 'Isolation pull movement targeting lats. Cable machine.';

-- Straight Bar Bench Mid Rows
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Barbell, Bench.'
WHERE slug = 'straight-bar-bench-mid-rows' AND cue = 'Compound pull movement targeting upper back. Barbell, Bench.';

-- Straight Raises on Incline Bench
UPDATE exercises SET cue = 'Isolation vertical_press movement targeting front delts. adjustable_bench, Barbell, Bench.'
WHERE slug = 'straight-raises-on-incline-bench' AND cue = 'Isolation push movement targeting front delts, side delts. Bench, Barbell.';

-- Sumo Deadlift
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Barbell.'
WHERE slug = 'sumo-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Sumo Deadlift with Bands
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Barbell.'
WHERE slug = 'sumo-deadlift-with-bands' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Sumo Deadlift with Chains
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Barbell.'
WHERE slug = 'sumo-deadlift-with-chains' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Supine Chest Throw
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Medicine ball.'
WHERE slug = 'supine-chest-throw' AND cue = 'Compound push movement targeting triceps. Medicine ball.';

-- Supine One-Arm Overhead Throw
UPDATE exercises SET cue = 'Compound core movement targeting abs. Medicine ball.'
WHERE slug = 'supine-one-arm-overhead-throw' AND cue = 'Compound pull movement targeting abs. Medicine ball.';

-- Supine Two-Arm Overhead Throw
UPDATE exercises SET cue = 'Compound core movement targeting abs. Medicine ball.'
WHERE slug = 'supine-two-arm-overhead-throw' AND cue = 'Compound pull movement targeting abs. Medicine ball.';

-- T-Bar Row with Handle
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Barbell.'
WHERE slug = 't-bar-row-with-handle' AND cue = 'Compound pull movement targeting upper back. Barbell.';

-- Table Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting lats.'
WHERE slug = 'table-row' AND cue = 'Compound pull movement targeting lats, upper back. Bodyweight.';

-- Tate Press
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'tate-press' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Thigh Abductor
UPDATE exercises SET cue = 'Isolation other movement targeting abductors. Machine.'
WHERE slug = 'thigh-abductor' AND cue = 'Isolation push movement targeting abductors. Machine.';

-- Thigh Adductor
UPDATE exercises SET cue = 'Isolation other movement targeting adductors. Machine.'
WHERE slug = 'thigh-adductor' AND cue = 'Isolation pull movement targeting adductors. Machine.';

-- Tricep Dumbbell Kickback
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'tricep-dumbbell-kickback' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Triceps Overhead Extension with Rope
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'triceps-overhead-extension-with-rope' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Triceps Pushdown
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'triceps-pushdown' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Triceps Pushdown - Rope Attachment
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'triceps-pushdown-rope-attachment' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Triceps Pushdown - V-Bar Attachment
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'triceps-pushdown-v-bar-attachment' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Tuck Crunch
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'tuck-crunch' AND cue = 'Isolation pull movement targeting abs.';

-- Two-Arm Dumbbell Preacher Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'two-arm-dumbbell-preacher-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Two-Arm Kettlebell Jerk
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'two-arm-kettlebell-jerk' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Two-Arm Kettlebell Military Press
UPDATE exercises SET cue = 'Compound vertical_press movement targeting front delts. Kettlebell.'
WHERE slug = 'two-arm-kettlebell-military-press' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Two-Arm Kettlebell Row
UPDATE exercises SET cue = 'Compound horizontal_pull movement targeting upper back. Kettlebell.'
WHERE slug = 'two-arm-kettlebell-row' AND cue = 'Compound pull movement targeting upper back. Kettlebell.';

-- Underhand Cable Pulldowns
UPDATE exercises SET cue = 'Compound vertical_pull movement targeting lats. Cable machine.'
WHERE slug = 'underhand-cable-pulldowns' AND cue = 'Compound pull movement targeting lats. Cable machine.';

-- Upright Barbell Row
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Barbell.'
WHERE slug = 'upright-barbell-row' AND cue = 'Compound pull movement targeting front delts, side delts. Barbell.';

-- Upright Cable Row
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Cable machine.'
WHERE slug = 'upright-cable-row' AND cue = 'Compound pull movement targeting traps. Cable machine.';

-- Upright Row - With Bands
UPDATE exercises SET cue = 'Isolation lateral_delt movement targeting side delts. Bands.'
WHERE slug = 'upright-row-with-bands' AND cue = 'Compound pull movement targeting traps. Bands.';

-- V-Bar Pulldown
UPDATE exercises SET cue = 'Compound vertical_pull movement targeting lats. Cable machine.'
WHERE slug = 'v-bar-pulldown' AND cue = 'Compound pull movement targeting lats. Cable machine.';

-- V-Bar Pullup
UPDATE exercises SET cue = 'Compound vertical_pull movement targeting lats. pull_up_bar.'
WHERE slug = 'v-bar-pullup' AND cue = 'Compound pull movement targeting lats. Pull-up bar.';

-- Vertical Swing
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Dumbbells.'
WHERE slug = 'vertical-swing' AND cue = 'Compound pull movement targeting hamstrings. Dumbbells.';

-- Weighted Ball Hyperextension
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. stability_ball.'
WHERE slug = 'weighted-ball-hyperextension' AND cue = 'Compound pull movement targeting lower back. Stability ball.';

-- Weighted Ball Side Bend
UPDATE exercises SET cue = 'Isolation core movement targeting abs. stability_ball.'
WHERE slug = 'weighted-ball-side-bend' AND cue = 'Isolation pull movement targeting abs. Stability ball.';

-- Weighted Crunches
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Medicine ball.'
WHERE slug = 'weighted-crunches' AND cue = 'Isolation pull movement targeting abs. Medicine ball.';

-- Weighted Jump Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'weighted-jump-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Weighted Sissy Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'weighted-sissy-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Wide-Grip Barbell Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. Barbell, Bench.'
WHERE slug = 'wide-grip-barbell-bench-press' AND cue = 'Compound push movement targeting chest. Barbell, Bench.';

-- Wide-Grip Decline Barbell Bench Press
UPDATE exercises SET cue = 'Compound horizontal_press movement targeting chest. adjustable_bench, Barbell, Bench.'
WHERE slug = 'wide-grip-decline-barbell-bench-press' AND cue = 'Compound push movement targeting chest. Bench, Barbell.';

-- Wide-Grip Lat Pulldown
UPDATE exercises SET cue = 'Compound vertical_pull movement targeting lats. Cable machine.'
WHERE slug = 'wide-grip-lat-pulldown' AND cue = 'Compound pull movement targeting lats. Cable machine.';

-- Wide-Grip Pulldown Behind The Neck
UPDATE exercises SET cue = 'Compound vertical_pull movement targeting lats. Cable machine.'
WHERE slug = 'wide-grip-pulldown-behind-the-neck' AND cue = 'Compound pull movement targeting lats. Cable machine.';

-- Wide-Grip Rear Pull-Up
UPDATE exercises SET cue = 'Compound vertical_pull movement targeting lats. pull_up_bar.'
WHERE slug = 'wide-grip-rear-pull-up' AND cue = 'Compound pull movement targeting lats. Pull-up bar.';

-- Wide-Grip Standing Barbell Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Barbell.'
WHERE slug = 'wide-grip-standing-barbell-curl' AND cue = 'Isolation pull movement targeting biceps. Barbell.';

-- Wide Stance Barbell Squat
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'wide-stance-barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Wind Sprints
UPDATE exercises SET cue = 'Compound cardio movement targeting abs.'
WHERE slug = 'wind-sprints' AND cue = 'Compound pull movement targeting abs.';

-- Wrist Rotations with Straight Bar
UPDATE exercises SET cue = 'Isolation forearm movement targeting forearms. Barbell.'
WHERE slug = 'wrist-rotations-with-straight-bar' AND cue = 'Isolation pull movement targeting forearms. Barbell.';

-- Zercher Squats
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell.'
WHERE slug = 'zercher-squats' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Zottman Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'zottman-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';

-- Zottman Preacher Curl
UPDATE exercises SET cue = 'Isolation biceps movement targeting biceps. Dumbbells.'
WHERE slug = 'zottman-preacher-curl' AND cue = 'Isolation pull movement targeting biceps. Dumbbells.';
