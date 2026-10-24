-- Catalogue Descriptions (Cues) Correctness Fixes
-- This migration is idempotent (safe to re-run)
-- Fixes exercises where the cue contradicts the movement pattern or mechanic

-- 3/4 Sit-Up (3-4-sit-up): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = '3-4-sit-up' AND cue = 'Compound pull movement targeting abs.';

-- Ab Crunch Machine (ab-crunch-machine): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Machine.'
WHERE slug = 'ab-crunch-machine' AND cue = 'Isolation pull movement targeting abs. Machine.';

-- Advanced Kettlebell Windmill (advanced-kettlebell-windmill): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Kettlebell.'
WHERE slug = 'advanced-kettlebell-windmill' AND cue = 'Isolation push movement targeting abs. Kettlebell.';

-- Air Bike (air-bike): cardio pattern, compound mechanic
UPDATE exercises SET cue = 'Compound cardio movement targeting abs.'
WHERE slug = 'air-bike' AND cue = 'Compound pull movement targeting abs.';

-- Alternate Heel Touchers (alternate-heel-touchers): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'alternate-heel-touchers' AND cue = 'Isolation pull movement targeting abs.';

-- Alternating Hang Clean (alternating-hang-clean): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'alternating-hang-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Back Flyes - With Bands (back-flyes-with-bands): horizontal_press pattern, compound mechanic
UPDATE exercises SET cue = 'Compound push movement targeting front delts, side delts. Bands.'
WHERE slug = 'back-flyes-with-bands' AND cue = 'Compound pull movement targeting front delts, side delts. Bands.';

-- Ball Leg Curl (ball-leg-curl): hinge pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation hinge movement targeting hamstrings. Stability ball.'
WHERE slug = 'ball-leg-curl' AND cue = 'Isolation pull movement targeting hamstrings. Stability ball.';

-- Band Good Morning (band-good-morning): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Bands.'
WHERE slug = 'band-good-morning' AND cue = 'Compound pull movement targeting hamstrings. Bands.';

-- Band Good Morning (Pull Through) (band-good-morning-pull-through): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Bands.'
WHERE slug = 'band-good-morning-pull-through' AND cue = 'Compound pull movement targeting hamstrings. Bands.';

-- Band Hip Adductions (band-hip-adductions): other pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation accessory movement targeting adductors. Bands.'
WHERE slug = 'band-hip-adductions' AND cue = 'Isolation pull movement targeting adductors. Bands.';

-- Band Pull Apart (band-pull-apart): rear_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation rear delt movement targeting rear delts. Bands.'
WHERE slug = 'band-pull-apart' AND cue = 'Isolation pull movement targeting rear delts. Bands.';

-- Band Skull Crusher (band-skull-crusher): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Bands.'
WHERE slug = 'band-skull-crusher' AND cue = 'Isolation push movement targeting triceps. Bands.';

-- Barbell Ab Rollout (barbell-ab-rollout): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Barbell.'
WHERE slug = 'barbell-ab-rollout' AND cue = 'Compound pull movement targeting abs. Barbell.';

-- Barbell Ab Rollout - On Knees (barbell-ab-rollout-on-knees): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Barbell.'
WHERE slug = 'barbell-ab-rollout-on-knees' AND cue = 'Compound pull movement targeting abs. Barbell.';

-- Barbell Deadlift (barbell-deadlift): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'barbell-deadlift' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Barbell Full Squat (barbell-full-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'barbell-full-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Glute Bridge (barbell-glute-bridge): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Barbell.'
WHERE slug = 'barbell-glute-bridge' AND cue = 'Compound push movement targeting glutes. Barbell.';

-- Barbell Hack Squat (barbell-hack-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'barbell-hack-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Hip Thrust (barbell-hip-thrust): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Barbell.'
WHERE slug = 'barbell-hip-thrust' AND cue = 'Compound push movement targeting glutes. Barbell.';

-- Barbell Lunge (barbell-lunge): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Barbell.'
WHERE slug = 'barbell-lunge' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Barbell Rollout from Bench (barbell-rollout-from-bench): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Barbell, Bench.'
WHERE slug = 'barbell-rollout-from-bench' AND cue = 'Compound pull movement targeting abs. Barbell, Bench.';

-- Barbell Seated Calf Raise (barbell-seated-calf-raise): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Barbell.'
WHERE slug = 'barbell-seated-calf-raise' AND cue = 'Isolation push movement targeting calves. Barbell.';

-- Barbell Shrug (barbell-shrug): other pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation accessory movement targeting traps. Barbell.'
WHERE slug = 'barbell-shrug' AND cue = 'Isolation pull movement targeting traps. Barbell.';

-- Barbell Shrug Behind The Back (barbell-shrug-behind-the-back): other pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation accessory movement targeting traps. Barbell.'
WHERE slug = 'barbell-shrug-behind-the-back' AND cue = 'Isolation pull movement targeting traps. Barbell.';

-- Barbell Side Bend (barbell-side-bend): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Barbell.'
WHERE slug = 'barbell-side-bend' AND cue = 'Isolation pull movement targeting abs. Barbell.';

-- Barbell Side Split Squat (barbell-side-split-squat): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Barbell, Rack.'
WHERE slug = 'barbell-side-split-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Squat (barbell-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Barbell Squat To A Bench (barbell-squat-to-a-bench): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Bench, Rack.'
WHERE slug = 'barbell-squat-to-a-bench' AND cue = 'Compound push movement targeting quads. Barbell, Bench, Rack.';

-- Barbell Step Ups (barbell-step-ups): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Barbell.'
WHERE slug = 'barbell-step-ups' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Barbell Walking Lunge (barbell-walking-lunge): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Barbell.'
WHERE slug = 'barbell-walking-lunge' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Bench Jump (bench-jump): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Bench.'
WHERE slug = 'bench-jump' AND cue = 'Compound push movement targeting quads. Bench.';

-- Bent-Knee Hip Raise (bent-knee-hip-raise): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'bent-knee-hip-raise' AND cue = 'Compound pull movement targeting abs.';

-- Bent Over Dumbbell Rear Delt Raise With Head On Bench (bent-over-dumbbell-rear-delt-raise-with-head-on-bench): rear_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation rear delt movement targeting rear delts. Dumbbells, Bench.'
WHERE slug = 'bent-over-dumbbell-rear-delt-raise-with-head-on-bench' AND cue = 'Isolation pull movement targeting rear delts. Dumbbells, Bench.';

-- Bent Over Low-Pulley Side Lateral (bent-over-low-pulley-side-lateral): lateral_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation lateral raise movement targeting side delts. Cable machine.'
WHERE slug = 'bent-over-low-pulley-side-lateral' AND cue = 'Isolation pull movement targeting side delts. Cable machine.';

-- Bent Press (bent-press): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Kettlebell.'
WHERE slug = 'bent-press' AND cue = 'Compound pull movement targeting abs. Kettlebell.';

-- Board Press (board-press): triceps pattern, compound mechanic
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Barbell.'
WHERE slug = 'board-press' AND cue = 'Compound push movement targeting triceps. Barbell.';

-- Body-Up (body-up): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps.'
WHERE slug = 'body-up' AND cue = 'Isolation push movement targeting triceps.';

-- Body Tricep Press (body-tricep-press): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps.'
WHERE slug = 'body-tricep-press' AND cue = 'Isolation push movement targeting triceps.';

-- Bodyweight Squat (bodyweight-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'bodyweight-squat' AND cue = 'Compound push movement targeting quads.';

-- Bosu Ball Cable Crunch With Side Bends (bosu-ball-cable-crunch-with-side-bends): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'bosu-ball-cable-crunch-with-side-bends' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Bottoms Up (bottoms-up): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'bottoms-up' AND cue = 'Compound pull movement targeting abs.';

-- Box Squat (box-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'box-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Box Squat with Bands (box-squat-with-bands): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'box-squat-with-bands' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Box Squat with Chains (box-squat-with-chains): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'box-squat-with-chains' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Butt-Ups (butt-ups): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'butt-ups' AND cue = 'Compound pull movement targeting abs.';

-- Butt Lift (Bridge) (butt-lift-bridge): hinge pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation hinge movement targeting glutes.'
WHERE slug = 'butt-lift-bridge' AND cue = 'Isolation push movement targeting glutes.';

-- Butterfly (butterfly): horizontal_press pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation push movement targeting chest. Machine.'
WHERE slug = 'butterfly' AND cue = 'Isolation pull movement targeting chest. Machine.';

-- Cable Crunch (cable-crunch): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'cable-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Cable Deadlifts (cable-deadlifts): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting quads. Cable machine.'
WHERE slug = 'cable-deadlifts' AND cue = 'Compound pull movement targeting quads. Cable machine.';

-- Cable Hip Adduction (cable-hip-adduction): squat pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation squat movement targeting quads. Cable machine.'
WHERE slug = 'cable-hip-adduction' AND cue = 'Isolation pull movement targeting quads. Cable machine.';

-- Cable Incline Triceps Extension (cable-incline-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Bench, Cable machine.'
WHERE slug = 'cable-incline-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Bench, Cable machine.';

-- Cable Internal Rotation (cable-internal-rotation): vertical_press pattern, compound mechanic
UPDATE exercises SET cue = 'Compound push movement targeting front delts, side delts. Cable machine.'
WHERE slug = 'cable-internal-rotation' AND cue = 'Compound pull movement targeting front delts, side delts. Cable machine.';

-- Cable Judo Flip (cable-judo-flip): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Cable machine.'
WHERE slug = 'cable-judo-flip' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Cable Lying Triceps Extension (cable-lying-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine, Bench.'
WHERE slug = 'cable-lying-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Cable machine, Bench.';

-- Cable One Arm Tricep Extension (cable-one-arm-tricep-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'cable-one-arm-tricep-extension' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Cable Rear Delt Fly (cable-rear-delt-fly): rear_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation rear delt movement targeting rear delts. Cable machine.'
WHERE slug = 'cable-rear-delt-fly' AND cue = 'Isolation pull movement targeting rear delts. Cable machine.';

-- Cable Reverse Crunch (cable-reverse-crunch): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'cable-reverse-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Cable Rope Overhead Triceps Extension (cable-rope-overhead-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'cable-rope-overhead-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Cable Russian Twists (cable-russian-twists): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Cable machine.'
WHERE slug = 'cable-russian-twists' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Cable Seated Crunch (cable-seated-crunch): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'cable-seated-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Cable Seated Lateral Raise (cable-seated-lateral-raise): lateral_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation lateral raise movement targeting side delts. Cable machine.'
WHERE slug = 'cable-seated-lateral-raise' AND cue = 'Isolation pull movement targeting side delts. Cable machine.';

-- Cable Shrugs (cable-shrugs): other pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation accessory movement targeting traps. Cable machine.'
WHERE slug = 'cable-shrugs' AND cue = 'Isolation pull movement targeting traps. Cable machine.';

-- Calf-Machine Shoulder Shrug (calf-machine-shoulder-shrug): other pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation accessory movement targeting traps. Machine.'
WHERE slug = 'calf-machine-shoulder-shrug' AND cue = 'Isolation pull movement targeting traps. Machine.';

-- Calf Press (calf-press): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Machine.'
WHERE slug = 'calf-press' AND cue = 'Isolation push movement targeting calves. Machine.';

-- Calf Press On The Leg Press Machine (calf-press-on-the-leg-press-machine): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Leg press.'
WHERE slug = 'calf-press-on-the-leg-press-machine' AND cue = 'Isolation push movement targeting calves. Leg press.';

-- Calf Raise On A Dumbbell (calf-raise-on-a-dumbbell): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Dumbbells.'
WHERE slug = 'calf-raise-on-a-dumbbell' AND cue = 'Isolation push movement targeting calves. Dumbbells.';

-- Calf Raises - With Bands (calf-raises-with-bands): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Bands.'
WHERE slug = 'calf-raises-with-bands' AND cue = 'Isolation push movement targeting calves. Bands.';

-- Catch and Overhead Throw (catch-and-overhead-throw): vertical_pull pattern, compound mechanic
UPDATE exercises SET cue = 'Compound pull movement targeting lats. Medicine ball.'
WHERE slug = 'catch-and-overhead-throw' AND cue = 'Compound push movement targeting lats. Medicine ball.';

-- Chair Squat (chair-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Machine.'
WHERE slug = 'chair-squat' AND cue = 'Compound push movement targeting quads. Machine.';

-- Chest Push with Run Release (chest-push-with-run-release): cardio pattern, compound mechanic
UPDATE exercises SET cue = 'Compound cardio movement targeting chest. Medicine ball.'
WHERE slug = 'chest-push-with-run-release' AND cue = 'Compound push movement targeting chest. Medicine ball.';

-- Close-Grip Dumbbell Press (close-grip-dumbbell-press): triceps pattern, compound mechanic
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'close-grip-dumbbell-press' AND cue = 'Compound push movement targeting triceps. Dumbbells.';

-- Close-Grip EZ-Bar Press (close-grip-ez-bar-press): triceps pattern, compound mechanic
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. EZ bar.'
WHERE slug = 'close-grip-ez-bar-press' AND cue = 'Compound push movement targeting triceps. EZ bar.';

-- Cocoons (cocoons): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'cocoons' AND cue = 'Compound pull movement targeting abs.';

-- Cross-Body Crunch (cross-body-crunch): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'cross-body-crunch' AND cue = 'Compound pull movement targeting abs.';

-- Crunch - Hands Overhead (crunch-hands-overhead): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'crunch-hands-overhead' AND cue = 'Isolation pull movement targeting abs.';

-- Crunch - Legs On Exercise Ball (crunch-legs-on-exercise-ball): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'crunch-legs-on-exercise-ball' AND cue = 'Isolation pull movement targeting abs.';

-- Crunches (crunches): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'crunches' AND cue = 'Isolation pull movement targeting abs.';

-- Dead Bug (dead-bug): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'dead-bug' AND cue = 'Compound pull movement targeting abs.';

-- Deadlift with Bands (deadlift-with-bands): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'deadlift-with-bands' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Deadlift with Chains (deadlift-with-chains): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'deadlift-with-chains' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Decline Close-Grip Bench To Skull Crusher (decline-close-grip-bench-to-skull-crusher): triceps pattern, compound mechanic
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Bench, Barbell.'
WHERE slug = 'decline-close-grip-bench-to-skull-crusher' AND cue = 'Compound push movement targeting triceps. Bench, Barbell.';

-- Decline Crunch (decline-crunch): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Bench.'
WHERE slug = 'decline-crunch' AND cue = 'Isolation pull movement targeting abs. Bench.';

-- Decline Dumbbell Triceps Extension (decline-dumbbell-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Bench, Dumbbells.'
WHERE slug = 'decline-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Bench, Dumbbells.';

-- Decline EZ Bar Triceps Extension (decline-ez-bar-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Bench, Barbell.'
WHERE slug = 'decline-ez-bar-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Bench, Barbell.';

-- Decline Oblique Crunch (decline-oblique-crunch): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Bench.'
WHERE slug = 'decline-oblique-crunch' AND cue = 'Compound pull movement targeting abs. Bench.';

-- Decline Reverse Crunch (decline-reverse-crunch): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Bench.'
WHERE slug = 'decline-reverse-crunch' AND cue = 'Compound pull movement targeting abs. Bench.';

-- Deficit Deadlift (deficit-deadlift): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'deficit-deadlift' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Double Kettlebell Alternating Hang Clean (double-kettlebell-alternating-hang-clean): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'double-kettlebell-alternating-hang-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Double Kettlebell Snatch (double-kettlebell-snatch): vertical_press pattern, compound mechanic
UPDATE exercises SET cue = 'Compound push movement targeting front delts, side delts. Kettlebell.'
WHERE slug = 'double-kettlebell-snatch' AND cue = 'Compound pull movement targeting front delts, side delts. Kettlebell.';

-- Double Leg Butt Kick (double-leg-butt-kick): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'double-leg-butt-kick' AND cue = 'Compound push movement targeting quads.';

-- Dumbbell Clean (dumbbell-clean): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Dumbbells.'
WHERE slug = 'dumbbell-clean' AND cue = 'Compound pull movement targeting hamstrings. Dumbbells.';

-- Dumbbell Floor Press (dumbbell-floor-press): triceps pattern, compound mechanic
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'dumbbell-floor-press' AND cue = 'Compound push movement targeting triceps. Dumbbells.';

-- Dumbbell Lunges (dumbbell-lunges): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Dumbbells.'
WHERE slug = 'dumbbell-lunges' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Lying One-Arm Rear Lateral Raise (dumbbell-lying-one-arm-rear-lateral-raise): lateral_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation lateral raise movement targeting side delts. Dumbbells, Bench.'
WHERE slug = 'dumbbell-lying-one-arm-rear-lateral-raise' AND cue = 'Isolation pull movement targeting side delts. Dumbbells, Bench.';

-- Dumbbell Lying Rear Lateral Raise (dumbbell-lying-rear-lateral-raise): lateral_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation lateral raise movement targeting side delts. Dumbbells, Bench.'
WHERE slug = 'dumbbell-lying-rear-lateral-raise' AND cue = 'Isolation pull movement targeting side delts. Dumbbells, Bench.';

-- Dumbbell One-Arm Triceps Extension (dumbbell-one-arm-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'dumbbell-one-arm-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Dumbbell Raise (dumbbell-raise): vertical_press pattern, compound mechanic
UPDATE exercises SET cue = 'Compound push movement targeting front delts, side delts. Dumbbells.'
WHERE slug = 'dumbbell-raise' AND cue = 'Compound pull movement targeting front delts, side delts. Dumbbells.';

-- Dumbbell Rear Lunge (dumbbell-rear-lunge): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Dumbbells.'
WHERE slug = 'dumbbell-rear-lunge' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Seated Box Jump (dumbbell-seated-box-jump): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Dumbbells.'
WHERE slug = 'dumbbell-seated-box-jump' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Seated One-Leg Calf Raise (dumbbell-seated-one-leg-calf-raise): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Dumbbells.'
WHERE slug = 'dumbbell-seated-one-leg-calf-raise' AND cue = 'Isolation push movement targeting calves. Dumbbells.';

-- Dumbbell Shrug (dumbbell-shrug): other pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation accessory movement targeting traps. Dumbbells.'
WHERE slug = 'dumbbell-shrug' AND cue = 'Isolation pull movement targeting traps. Dumbbells.';

-- Dumbbell Side Bend (dumbbell-side-bend): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Dumbbells.'
WHERE slug = 'dumbbell-side-bend' AND cue = 'Isolation pull movement targeting abs. Dumbbells.';

-- Dumbbell Squat (dumbbell-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Dumbbells.'
WHERE slug = 'dumbbell-squat' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Squat To A Bench (dumbbell-squat-to-a-bench): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Dumbbells, Bench.'
WHERE slug = 'dumbbell-squat-to-a-bench' AND cue = 'Compound push movement targeting quads. Dumbbells, Bench.';

-- Dumbbell Step Ups (dumbbell-step-ups): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Dumbbells.'
WHERE slug = 'dumbbell-step-ups' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Dumbbell Tricep Extension -Pronated Grip (dumbbell-tricep-extension-pronated-grip): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'dumbbell-tricep-extension-pronated-grip' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- EZ-Bar Skullcrusher (ez-bar-skullcrusher): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. EZ bar.'
WHERE slug = 'ez-bar-skullcrusher' AND cue = 'Isolation push movement targeting triceps. EZ bar.';

-- Elbow to Knee (elbow-to-knee): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'elbow-to-knee' AND cue = 'Compound pull movement targeting abs.';

-- Elevated Back Lunge (elevated-back-lunge): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Barbell.'
WHERE slug = 'elevated-back-lunge' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Exercise Ball Crunch (exercise-ball-crunch): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Stability ball.'
WHERE slug = 'exercise-ball-crunch' AND cue = 'Isolation pull movement targeting abs. Stability ball.';

-- Exercise Ball Pull-In (exercise-ball-pull-in): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Stability ball.'
WHERE slug = 'exercise-ball-pull-in' AND cue = 'Compound pull movement targeting abs. Stability ball.';

-- External Rotation (external-rotation): vertical_press pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation push movement targeting front delts, side delts. Dumbbells.'
WHERE slug = 'external-rotation' AND cue = 'Isolation pull movement targeting front delts, side delts. Dumbbells.';

-- External Rotation with Band (external-rotation-with-band): vertical_press pattern, compound mechanic
UPDATE exercises SET cue = 'Compound push movement targeting front delts, side delts. Bands.'
WHERE slug = 'external-rotation-with-band' AND cue = 'Compound pull movement targeting front delts, side delts. Bands.';

-- External Rotation with Cable (external-rotation-with-cable): vertical_press pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation push movement targeting front delts, side delts. Cable machine.'
WHERE slug = 'external-rotation-with-cable' AND cue = 'Isolation pull movement targeting front delts, side delts. Cable machine.';

-- Fast Skipping (fast-skipping): cardio pattern, compound mechanic
UPDATE exercises SET cue = 'Compound cardio movement targeting quads. Jump rope.'
WHERE slug = 'fast-skipping' AND cue = 'Compound push movement targeting quads. Jump rope.';

-- Flat Bench Leg Pull-In (flat-bench-leg-pull-in): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Bench.'
WHERE slug = 'flat-bench-leg-pull-in' AND cue = 'Compound pull movement targeting abs. Bench.';

-- Flat Bench Lying Leg Raise (flat-bench-lying-leg-raise): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Bench.'
WHERE slug = 'flat-bench-lying-leg-raise' AND cue = 'Isolation pull movement targeting abs. Bench.';

-- Floor Press (floor-press): triceps pattern, compound mechanic
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Barbell.'
WHERE slug = 'floor-press' AND cue = 'Compound push movement targeting triceps. Barbell.';

-- Floor Press with Chains (floor-press-with-chains): triceps pattern, compound mechanic
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Barbell.'
WHERE slug = 'floor-press-with-chains' AND cue = 'Compound push movement targeting triceps. Barbell.';

-- Flutter Kicks (flutter-kicks): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes.'
WHERE slug = 'flutter-kicks' AND cue = 'Compound pull movement targeting glutes.';

-- Freehand Jump Squat (freehand-jump-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'freehand-jump-squat' AND cue = 'Compound push movement targeting quads.';

-- Frog Sit-Ups (frog-sit-ups): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'frog-sit-ups' AND cue = 'Isolation pull movement targeting abs.';

-- Front Barbell Squat (front-barbell-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'front-barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Front Barbell Squat To A Bench (front-barbell-squat-to-a-bench): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Bench, Rack.'
WHERE slug = 'front-barbell-squat-to-a-bench' AND cue = 'Compound push movement targeting quads. Barbell, Bench, Rack.';

-- Front Raise And Pullover (front-raise-and-pullover): horizontal_press pattern, compound mechanic
UPDATE exercises SET cue = 'Compound push movement targeting chest. Barbell.'
WHERE slug = 'front-raise-and-pullover' AND cue = 'Compound pull movement targeting chest. Barbell.';

-- Front Squat (Clean Grip) (front-squat-clean-grip): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'front-squat-clean-grip' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Front Squats With Two Kettlebells (front-squats-with-two-kettlebells): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Kettlebell.'
WHERE slug = 'front-squats-with-two-kettlebells' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- Glute Ham Raise (glute-ham-raise): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Machine.'
WHERE slug = 'glute-ham-raise' AND cue = 'Compound pull movement targeting hamstrings. Machine.';

-- Glute Kickback (glute-kickback): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes.'
WHERE slug = 'glute-kickback' AND cue = 'Compound push movement targeting glutes.';

-- Goblet Squat (goblet-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Kettlebell.'
WHERE slug = 'goblet-squat' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- Good Morning (good-morning): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell, Rack.'
WHERE slug = 'good-morning' AND cue = 'Compound push movement targeting hamstrings. Barbell, Rack.';

-- Good Morning off Pins (good-morning-off-pins): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell, Rack.'
WHERE slug = 'good-morning-off-pins' AND cue = 'Compound push movement targeting hamstrings. Barbell, Rack.';

-- Gorilla Chin/Crunch (gorilla-chin-crunch): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'gorilla-chin-crunch' AND cue = 'Compound pull movement targeting abs.';

-- Hack Squat (hack-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Hack squat.'
WHERE slug = 'hack-squat' AND cue = 'Compound push movement targeting quads. Hack squat.';

-- Hanging Bar Good Morning (hanging-bar-good-morning): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell, Pull-up bar, Rack.'
WHERE slug = 'hanging-bar-good-morning' AND cue = 'Compound push movement targeting hamstrings. Barbell, Pull-up bar, Rack.';

-- Hanging Leg Raise (hanging-leg-raise): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Pull-up bar.'
WHERE slug = 'hanging-leg-raise' AND cue = 'Isolation pull movement targeting abs. Pull-up bar.';

-- Hanging Pike (hanging-pike): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Pull-up bar.'
WHERE slug = 'hanging-pike' AND cue = 'Compound pull movement targeting abs. Pull-up bar.';

-- Hip Extension with Bands (hip-extension-with-bands): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Bands.'
WHERE slug = 'hip-extension-with-bands' AND cue = 'Compound push movement targeting glutes. Bands.';

-- Hip Flexion with Band (hip-flexion-with-band): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Bands.'
WHERE slug = 'hip-flexion-with-band' AND cue = 'Compound pull movement targeting quads. Bands.';

-- Hip Lift with Band (hip-lift-with-band): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Bands.'
WHERE slug = 'hip-lift-with-band' AND cue = 'Compound push movement targeting glutes. Bands.';

-- Hyperextensions With No Hyperextension Bench (hyperextensions-with-no-hyperextension-bench): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Bench.'
WHERE slug = 'hyperextensions-with-no-hyperextension-bench' AND cue = 'Compound pull movement targeting lower back. Bench.';

-- Incline Barbell Triceps Extension (incline-barbell-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Bench, Barbell.'
WHERE slug = 'incline-barbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Bench, Barbell.';

-- JM Press (jm-press): triceps pattern, compound mechanic
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Barbell.'
WHERE slug = 'jm-press' AND cue = 'Compound push movement targeting triceps. Barbell.';

-- Jackknife Sit-Up (jackknife-sit-up): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'jackknife-sit-up' AND cue = 'Compound pull movement targeting abs.';

-- Janda Sit-Up (janda-sit-up): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'janda-sit-up' AND cue = 'Isolation pull movement targeting abs.';

-- Jefferson Squats (jefferson-squats): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell.'
WHERE slug = 'jefferson-squats' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Kettlebell Dead Clean (kettlebell-dead-clean): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'kettlebell-dead-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Kettlebell Halo with Overhead Extension (kettlebell-halo-with-overhead-extension): triceps pattern, compound mechanic
UPDATE exercises SET cue = 'Compound triceps movement targeting front delts, side delts, triceps. Kettlebell.'
WHERE slug = 'kettlebell-halo-with-overhead-extension' AND cue = 'Compound push movement targeting front delts, side delts, triceps. Kettlebell.';

-- Kettlebell Hang Clean (kettlebell-hang-clean): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'kettlebell-hang-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Kettlebell One-Legged Deadlift (kettlebell-one-legged-deadlift): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'kettlebell-one-legged-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Kettlebell Overhead Triceps Extension (kettlebell-overhead-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Kettlebell.'
WHERE slug = 'kettlebell-overhead-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Kettlebell.';

-- Kettlebell Pass Between The Legs (kettlebell-pass-between-the-legs): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Kettlebell.'
WHERE slug = 'kettlebell-pass-between-the-legs' AND cue = 'Compound pull movement targeting abs. Kettlebell.';

-- Kettlebell Pistol Squat (kettlebell-pistol-squat): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Kettlebell.'
WHERE slug = 'kettlebell-pistol-squat' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- Kettlebell Sumo High Pull (kettlebell-sumo-high-pull): other pattern, compound mechanic
UPDATE exercises SET cue = 'Compound accessory movement targeting traps. Kettlebell.'
WHERE slug = 'kettlebell-sumo-high-pull' AND cue = 'Compound pull movement targeting traps. Kettlebell.';

-- Kettlebell Turkish Get-Up (Lunge style) (kettlebell-turkish-get-up-lunge-style): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting front delts, side delts. Kettlebell.'
WHERE slug = 'kettlebell-turkish-get-up-lunge-style' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Kettlebell Turkish Get-Up (Squat style) (kettlebell-turkish-get-up-squat-style): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting front delts, side delts. Kettlebell.'
WHERE slug = 'kettlebell-turkish-get-up-squat-style' AND cue = 'Compound push movement targeting front delts, side delts. Kettlebell.';

-- Kettlebell Windmill (kettlebell-windmill): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Kettlebell.'
WHERE slug = 'kettlebell-windmill' AND cue = 'Compound pull movement targeting abs. Kettlebell.';

-- Knee Tuck Jump (knee-tuck-jump): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings.'
WHERE slug = 'knee-tuck-jump' AND cue = 'Compound push movement targeting hamstrings.';

-- Kneeling Cable Crunch With Alternating Oblique Twists (kneeling-cable-crunch-with-alternating-oblique-twists): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'kneeling-cable-crunch-with-alternating-oblique-twists' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Kneeling Cable Triceps Extension (kneeling-cable-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'kneeling-cable-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Kneeling Squat (kneeling-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting glutes. Barbell, Rack.'
WHERE slug = 'kneeling-squat' AND cue = 'Compound push movement targeting glutes. Barbell, Rack.';

-- Landmine 180's (landmine-180-s): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Barbell.'
WHERE slug = 'landmine-180-s' AND cue = 'Compound pull movement targeting abs. Barbell.';

-- Lateral Bound (lateral-bound): other pattern, compound mechanic
UPDATE exercises SET cue = 'Compound accessory movement targeting adductors.'
WHERE slug = 'lateral-bound' AND cue = 'Compound push movement targeting adductors.';

-- Lateral Raise - With Bands (lateral-raise-with-bands): lateral_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation lateral raise movement targeting side delts. Bands.'
WHERE slug = 'lateral-raise-with-bands' AND cue = 'Isolation push movement targeting side delts. Bands.';

-- Leg Extensions (leg-extensions): squat pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation squat movement targeting quads. Leg extension.'
WHERE slug = 'leg-extensions' AND cue = 'Isolation push movement targeting quads. Leg extension.';

-- Leg Lift (leg-lift): hinge pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation hinge movement targeting glutes.'
WHERE slug = 'leg-lift' AND cue = 'Isolation push movement targeting glutes.';

-- Leg Press (leg-press): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Leg press.'
WHERE slug = 'leg-press' AND cue = 'Compound push movement targeting quads. Leg press.';

-- Leg Pull-In (leg-pull-in): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'leg-pull-in' AND cue = 'Compound pull movement targeting abs.';

-- Leverage Deadlift (leverage-deadlift): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting quads. Machine.'
WHERE slug = 'leverage-deadlift' AND cue = 'Compound pull movement targeting quads. Machine.';

-- Leverage Shrug (leverage-shrug): other pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation accessory movement targeting traps. Machine.'
WHERE slug = 'leverage-shrug' AND cue = 'Isolation pull movement targeting traps. Machine.';

-- Low Cable Triceps Extension (low-cable-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'low-cable-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Lunge Pass Through (lunge-pass-through): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'lunge-pass-through' AND cue = 'Compound push movement targeting hamstrings. Kettlebell.';

-- Lunge Sprint (lunge-sprint): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Machine.'
WHERE slug = 'lunge-sprint' AND cue = 'Compound push movement targeting quads. Machine.';

-- Lying Close-Grip Barbell Triceps Extension Behind The Head (lying-close-grip-barbell-triceps-extension-behind-the-head): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Barbell, Bench.'
WHERE slug = 'lying-close-grip-barbell-triceps-extension-behind-the-head' AND cue = 'Isolation push movement targeting triceps. Barbell, Bench.';

-- Lying Close-Grip Barbell Triceps Press To Chin (lying-close-grip-barbell-triceps-press-to-chin): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. EZ bar, Bench.'
WHERE slug = 'lying-close-grip-barbell-triceps-press-to-chin' AND cue = 'Isolation push movement targeting triceps. EZ bar, Bench.';

-- Lying Dumbbell Tricep Extension (lying-dumbbell-tricep-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells, Bench.'
WHERE slug = 'lying-dumbbell-tricep-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells, Bench.';

-- Lying Leg Curls (lying-leg-curls): hinge pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation hinge movement targeting hamstrings. Bench, Leg curl.'
WHERE slug = 'lying-leg-curls' AND cue = 'Isolation pull movement targeting hamstrings. Bench, Leg curl.';

-- Lying Machine Squat (lying-machine-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Bench, Machine.'
WHERE slug = 'lying-machine-squat' AND cue = 'Compound push movement targeting quads. Bench, Machine.';

-- Lying One-Arm Lateral Raise (lying-one-arm-lateral-raise): lateral_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation lateral raise movement targeting side delts. Dumbbells, Bench.'
WHERE slug = 'lying-one-arm-lateral-raise' AND cue = 'Isolation pull movement targeting side delts. Dumbbells, Bench.';

-- Lying Rear Delt Raise (lying-rear-delt-raise): rear_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation rear delt movement targeting rear delts. Dumbbells, Bench.'
WHERE slug = 'lying-rear-delt-raise' AND cue = 'Isolation pull movement targeting rear delts. Dumbbells, Bench.';

-- Lying Triceps Press (lying-triceps-press): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. EZ bar, Bench.'
WHERE slug = 'lying-triceps-press' AND cue = 'Isolation push movement targeting triceps. EZ bar, Bench.';

-- Machine Triceps Extension (machine-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Machine.'
WHERE slug = 'machine-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Machine.';

-- Medicine Ball Full Twist (medicine-ball-full-twist): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Medicine ball.'
WHERE slug = 'medicine-ball-full-twist' AND cue = 'Compound pull movement targeting abs. Medicine ball.';

-- Middle Back Shrug (middle-back-shrug): other pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation accessory movement targeting upper back. Dumbbells.'
WHERE slug = 'middle-back-shrug' AND cue = 'Isolation pull movement targeting upper back. Dumbbells.';

-- Monster Walk (monster-walk): other pattern, compound mechanic
UPDATE exercises SET cue = 'Compound accessory movement targeting abductors. Bands.'
WHERE slug = 'monster-walk' AND cue = 'Compound pull movement targeting abductors. Bands.';

-- Narrow Stance Hack Squats (narrow-stance-hack-squats): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Hack squat.'
WHERE slug = 'narrow-stance-hack-squats' AND cue = 'Compound push movement targeting quads. Hack squat.';

-- Narrow Stance Leg Press (narrow-stance-leg-press): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Leg press.'
WHERE slug = 'narrow-stance-leg-press' AND cue = 'Compound push movement targeting quads. Leg press.';

-- Narrow Stance Squats (narrow-stance-squats): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell.'
WHERE slug = 'narrow-stance-squats' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Natural Glute Ham Raise (natural-glute-ham-raise): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings.'
WHERE slug = 'natural-glute-ham-raise' AND cue = 'Compound pull movement targeting hamstrings.';

-- Oblique Crunches (oblique-crunches): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'oblique-crunches' AND cue = 'Isolation pull movement targeting abs.';

-- Oblique Crunches - On The Floor (oblique-crunches-on-the-floor): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'oblique-crunches-on-the-floor' AND cue = 'Isolation pull movement targeting abs.';

-- One-Arm High-Pulley Cable Side Bends (one-arm-high-pulley-cable-side-bends): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'one-arm-high-pulley-cable-side-bends' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- One-Arm Incline Lateral Raise (one-arm-incline-lateral-raise): lateral_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation lateral raise movement targeting side delts. Bench, Dumbbells.'
WHERE slug = 'one-arm-incline-lateral-raise' AND cue = 'Isolation push movement targeting side delts. Bench, Dumbbells.';

-- One-Arm Kettlebell Clean (one-arm-kettlebell-clean): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- One-Arm Kettlebell Snatch (one-arm-kettlebell-snatch): vertical_press pattern, compound mechanic
UPDATE exercises SET cue = 'Compound push movement targeting front delts, side delts. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-snatch' AND cue = 'Compound pull movement targeting front delts, side delts. Kettlebell.';

-- One-Arm Kettlebell Split Snatch (one-arm-kettlebell-split-snatch): vertical_press pattern, compound mechanic
UPDATE exercises SET cue = 'Compound push movement targeting front delts, side delts. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-split-snatch' AND cue = 'Compound pull movement targeting front delts, side delts. Kettlebell.';

-- One-Arm Kettlebell Swings (one-arm-kettlebell-swings): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'one-arm-kettlebell-swings' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- One-Arm Medicine Ball Slam (one-arm-medicine-ball-slam): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Medicine ball.'
WHERE slug = 'one-arm-medicine-ball-slam' AND cue = 'Compound pull movement targeting abs. Medicine ball.';

-- One-Arm Open Palm Kettlebell Clean (one-arm-open-palm-kettlebell-clean): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'one-arm-open-palm-kettlebell-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- One-Arm Overhead Kettlebell Squats (one-arm-overhead-kettlebell-squats): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Kettlebell.'
WHERE slug = 'one-arm-overhead-kettlebell-squats' AND cue = 'Compound push movement targeting quads. Kettlebell.';

-- One-Arm Side Deadlift (one-arm-side-deadlift): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting quads. Barbell.'
WHERE slug = 'one-arm-side-deadlift' AND cue = 'Compound pull movement targeting quads. Barbell.';

-- One-Arm Side Laterals (one-arm-side-laterals): lateral_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation lateral raise movement targeting side delts. Dumbbells.'
WHERE slug = 'one-arm-side-laterals' AND cue = 'Isolation push movement targeting side delts. Dumbbells.';

-- One-Legged Cable Kickback (one-legged-cable-kickback): hinge pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation hinge movement targeting glutes. Cable machine.'
WHERE slug = 'one-legged-cable-kickback' AND cue = 'Isolation push movement targeting glutes. Cable machine.';

-- One Arm Floor Press (one-arm-floor-press): triceps pattern, compound mechanic
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Barbell.'
WHERE slug = 'one-arm-floor-press' AND cue = 'Compound push movement targeting triceps. Barbell.';

-- One Arm Pronated Dumbbell Triceps Extension (one-arm-pronated-dumbbell-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'one-arm-pronated-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- One Arm Supinated Dumbbell Triceps Extension (one-arm-supinated-dumbbell-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'one-arm-supinated-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- One Leg Barbell Squat (one-leg-barbell-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'one-leg-barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Open Palm Kettlebell Clean (open-palm-kettlebell-clean): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Kettlebell.'
WHERE slug = 'open-palm-kettlebell-clean' AND cue = 'Compound pull movement targeting hamstrings. Kettlebell.';

-- Pallof Press (pallof-press): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'pallof-press' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Pallof Press With Rotation (pallof-press-with-rotation): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Cable machine.'
WHERE slug = 'pallof-press-with-rotation' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Physioball Hip Bridge (physioball-hip-bridge): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Stability ball.'
WHERE slug = 'physioball-hip-bridge' AND cue = 'Compound push movement targeting glutes. Stability ball.';

-- Pin Presses (pin-presses): triceps pattern, compound mechanic
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Barbell.'
WHERE slug = 'pin-presses' AND cue = 'Compound push movement targeting triceps. Barbell.';

-- Plie Dumbbell Squat (plie-dumbbell-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Dumbbells.'
WHERE slug = 'plie-dumbbell-squat' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Power Clean (power-clean): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'power-clean' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Press Sit-Up (press-sit-up): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Barbell.'
WHERE slug = 'press-sit-up' AND cue = 'Compound push movement targeting abs. Barbell.';

-- Pull Through (pull-through): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting glutes. Cable machine.'
WHERE slug = 'pull-through' AND cue = 'Compound pull movement targeting glutes. Cable machine.';

-- Rack Pull with Bands (rack-pull-with-bands): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'rack-pull-with-bands' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Rack Pulls (rack-pulls): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'rack-pulls' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Reverse Band Box Squat (reverse-band-box-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'reverse-band-box-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Reverse Band Deadlift (reverse-band-deadlift): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'reverse-band-deadlift' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Reverse Band Power Squat (reverse-band-power-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'reverse-band-power-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Reverse Band Sumo Deadlift (reverse-band-sumo-deadlift): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'reverse-band-sumo-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Reverse Crunch (reverse-crunch): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'reverse-crunch' AND cue = 'Isolation pull movement targeting abs.';

-- Reverse Flyes (reverse-flyes): rear_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation rear delt movement targeting rear delts. Dumbbells.'
WHERE slug = 'reverse-flyes' AND cue = 'Isolation pull movement targeting rear delts. Dumbbells.';

-- Reverse Flyes With External Rotation (reverse-flyes-with-external-rotation): rear_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation rear delt movement targeting rear delts. Dumbbells.'
WHERE slug = 'reverse-flyes-with-external-rotation' AND cue = 'Isolation pull movement targeting rear delts. Dumbbells.';

-- Reverse Grip Triceps Pushdown (reverse-grip-triceps-pushdown): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'reverse-grip-triceps-pushdown' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Reverse Machine Flyes (reverse-machine-flyes): rear_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation rear delt movement targeting rear delts. Machine.'
WHERE slug = 'reverse-machine-flyes' AND cue = 'Isolation pull movement targeting rear delts. Machine.';

-- Rocket Jump (rocket-jump): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'rocket-jump' AND cue = 'Compound push movement targeting quads.';

-- Rocking Standing Calf Raise (rocking-standing-calf-raise): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Barbell.'
WHERE slug = 'rocking-standing-calf-raise' AND cue = 'Isolation push movement targeting calves. Barbell.';

-- Romanian Deadlift (romanian-deadlift): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'romanian-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Rope Crunch (rope-crunch): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'rope-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Russian Twist (russian-twist): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'russian-twist' AND cue = 'Compound pull movement targeting abs.';

-- Scissors Jump (scissors-jump): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'scissors-jump' AND cue = 'Compound push movement targeting quads.';

-- Seated Barbell Twist (seated-barbell-twist): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Barbell.'
WHERE slug = 'seated-barbell-twist' AND cue = 'Isolation pull movement targeting abs. Barbell.';

-- Seated Bent-Over One-Arm Dumbbell Triceps Extension (seated-bent-over-one-arm-dumbbell-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'seated-bent-over-one-arm-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Seated Bent-Over Rear Delt Raise (seated-bent-over-rear-delt-raise): rear_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation rear delt movement targeting rear delts. Dumbbells.'
WHERE slug = 'seated-bent-over-rear-delt-raise' AND cue = 'Isolation pull movement targeting rear delts. Dumbbells.';

-- Seated Bent-Over Two-Arm Dumbbell Triceps Extension (seated-bent-over-two-arm-dumbbell-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'seated-bent-over-two-arm-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Seated Calf Raise (seated-calf-raise): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Machine.'
WHERE slug = 'seated-calf-raise' AND cue = 'Isolation push movement targeting calves. Machine.';

-- Seated Flat Bench Leg Pull-In (seated-flat-bench-leg-pull-in): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Bench.'
WHERE slug = 'seated-flat-bench-leg-pull-in' AND cue = 'Compound pull movement targeting abs. Bench.';

-- Seated Good Mornings (seated-good-mornings): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell.'
WHERE slug = 'seated-good-mornings' AND cue = 'Compound pull movement targeting lower back. Barbell.';

-- Seated Leg Curl (seated-leg-curl): hinge pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation hinge movement targeting hamstrings. Leg curl.'
WHERE slug = 'seated-leg-curl' AND cue = 'Isolation pull movement targeting hamstrings. Leg curl.';

-- Seated Leg Tucks (seated-leg-tucks): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'seated-leg-tucks' AND cue = 'Isolation pull movement targeting abs.';

-- Seated Side Lateral Raise (seated-side-lateral-raise): lateral_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation lateral raise movement targeting side delts. Dumbbells.'
WHERE slug = 'seated-side-lateral-raise' AND cue = 'Isolation push movement targeting side delts. Dumbbells.';

-- Seated Triceps Press (seated-triceps-press): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'seated-triceps-press' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Side Jackknife (side-jackknife): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'side-jackknife' AND cue = 'Compound pull movement targeting abs.';

-- Side Lateral Raise (side-lateral-raise): lateral_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation lateral raise movement targeting side delts. Dumbbells.'
WHERE slug = 'side-lateral-raise' AND cue = 'Isolation push movement targeting side delts. Dumbbells.';

-- Side Laterals to Front Raise (side-laterals-to-front-raise): lateral_delt pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation lateral raise movement targeting side delts. Dumbbells.'
WHERE slug = 'side-laterals-to-front-raise' AND cue = 'Isolation push movement targeting side delts. Dumbbells.';

-- Single-Leg Leg Extension (single-leg-leg-extension): squat pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation squat movement targeting quads. Leg extension.'
WHERE slug = 'single-leg-leg-extension' AND cue = 'Isolation push movement targeting quads. Leg extension.';

-- Single Leg Butt Kick (single-leg-butt-kick): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'single-leg-butt-kick' AND cue = 'Compound push movement targeting quads.';

-- Single Leg Glute Bridge (single-leg-glute-bridge): hinge pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation hinge movement targeting glutes.'
WHERE slug = 'single-leg-glute-bridge' AND cue = 'Isolation push movement targeting glutes.';

-- Sit-Up (sit-up): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'sit-up' AND cue = 'Isolation pull movement targeting abs.';

-- Smith Machine Behind the Back Shrug (smith-machine-behind-the-back-shrug): other pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation accessory movement targeting traps. Smith machine.'
WHERE slug = 'smith-machine-behind-the-back-shrug' AND cue = 'Isolation pull movement targeting traps. Smith machine.';

-- Smith Machine Calf Raise (smith-machine-calf-raise): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Smith machine.'
WHERE slug = 'smith-machine-calf-raise' AND cue = 'Isolation push movement targeting calves. Smith machine.';

-- Smith Machine Hang Power Clean (smith-machine-hang-power-clean): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Smith machine.'
WHERE slug = 'smith-machine-hang-power-clean' AND cue = 'Compound pull movement targeting hamstrings. Smith machine.';

-- Smith Machine Hip Raise (smith-machine-hip-raise): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Smith machine.'
WHERE slug = 'smith-machine-hip-raise' AND cue = 'Isolation pull movement targeting abs. Smith machine.';

-- Smith Machine Leg Press (smith-machine-leg-press): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Leg press.'
WHERE slug = 'smith-machine-leg-press' AND cue = 'Compound push movement targeting quads. Leg press.';

-- Smith Machine Pistol Squat (smith-machine-pistol-squat): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Smith machine.'
WHERE slug = 'smith-machine-pistol-squat' AND cue = 'Compound push movement targeting quads. Smith machine.';

-- Smith Machine Reverse Calf Raises (smith-machine-reverse-calf-raises): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Smith machine.'
WHERE slug = 'smith-machine-reverse-calf-raises' AND cue = 'Isolation push movement targeting calves. Smith machine.';

-- Smith Machine Squat (smith-machine-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Smith machine.'
WHERE slug = 'smith-machine-squat' AND cue = 'Compound push movement targeting quads. Smith machine.';

-- Smith Machine Stiff-Legged Deadlift (smith-machine-stiff-legged-deadlift): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Smith machine.'
WHERE slug = 'smith-machine-stiff-legged-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Smith machine.';

-- Smith Single-Leg Split Squat (smith-single-leg-split-squat): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Smith machine.'
WHERE slug = 'smith-single-leg-split-squat' AND cue = 'Compound push movement targeting quads. Smith machine.';

-- Snatch Pull (snatch-pull): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'snatch-pull' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Speed Band Overhead Triceps (speed-band-overhead-triceps): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Bands.'
WHERE slug = 'speed-band-overhead-triceps' AND cue = 'Isolation push movement targeting triceps. Bands.';

-- Speed Box Squat (speed-box-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'speed-box-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Speed Squats (speed-squats): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell.'
WHERE slug = 'speed-squats' AND cue = 'Compound push movement targeting quads. Barbell.';

-- Spell Caster (spell-caster): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Dumbbells.'
WHERE slug = 'spell-caster' AND cue = 'Compound pull movement targeting abs. Dumbbells.';

-- Spider Crawl (spider-crawl): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs.'
WHERE slug = 'spider-crawl' AND cue = 'Compound pull movement targeting abs.';

-- Split Jump (split-jump): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'split-jump' AND cue = 'Compound push movement targeting quads.';

-- Split Squat with Dumbbells (split-squat-with-dumbbells): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting quads. Dumbbells.'
WHERE slug = 'split-squat-with-dumbbells' AND cue = 'Compound push movement targeting quads. Dumbbells.';

-- Squat Jerk (squat-jerk): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'squat-jerk' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squat with Bands (squat-with-bands): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'squat-with-bands' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squat with Chains (squat-with-chains): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'squat-with-chains' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squat with Plate Movers (squat-with-plate-movers): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'squat-with-plate-movers' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Squats - With Bands (squats-with-bands): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Bands.'
WHERE slug = 'squats-with-bands' AND cue = 'Compound push movement targeting quads. Bands.';

-- Standing Barbell Calf Raise (standing-barbell-calf-raise): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Barbell.'
WHERE slug = 'standing-barbell-calf-raise' AND cue = 'Isolation push movement targeting calves. Barbell.';

-- Standing Bent-Over One-Arm Dumbbell Triceps Extension (standing-bent-over-one-arm-dumbbell-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'standing-bent-over-one-arm-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Standing Bent-Over Two-Arm Dumbbell Triceps Extension (standing-bent-over-two-arm-dumbbell-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'standing-bent-over-two-arm-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Standing Cable Lift (standing-cable-lift): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Cable machine.'
WHERE slug = 'standing-cable-lift' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Standing Cable Wood Chop (standing-cable-wood-chop): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Cable machine.'
WHERE slug = 'standing-cable-wood-chop' AND cue = 'Compound pull movement targeting abs. Cable machine.';

-- Standing Calf Raises (standing-calf-raises): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Machine.'
WHERE slug = 'standing-calf-raises' AND cue = 'Isolation push movement targeting calves. Machine.';

-- Standing Dumbbell Calf Raise (standing-dumbbell-calf-raise): calf pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation calf movement targeting calves. Dumbbells.'
WHERE slug = 'standing-dumbbell-calf-raise' AND cue = 'Isolation push movement targeting calves. Dumbbells.';

-- Standing Dumbbell Triceps Extension (standing-dumbbell-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'standing-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Standing Leg Curl (standing-leg-curl): hinge pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation hinge movement targeting hamstrings. Leg curl.'
WHERE slug = 'standing-leg-curl' AND cue = 'Isolation pull movement targeting hamstrings. Leg curl.';

-- Standing Long Jump (standing-long-jump): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'standing-long-jump' AND cue = 'Compound push movement targeting quads.';

-- Standing Low-Pulley One-Arm Triceps Extension (standing-low-pulley-one-arm-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'standing-low-pulley-one-arm-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Standing One-Arm Dumbbell Triceps Extension (standing-one-arm-dumbbell-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'standing-one-arm-dumbbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Standing Overhead Barbell Triceps Extension (standing-overhead-barbell-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Barbell.'
WHERE slug = 'standing-overhead-barbell-triceps-extension' AND cue = 'Isolation push movement targeting triceps. Barbell.';

-- Standing Rope Crunch (standing-rope-crunch): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Cable machine.'
WHERE slug = 'standing-rope-crunch' AND cue = 'Isolation pull movement targeting abs. Cable machine.';

-- Standing Towel Triceps Extension (standing-towel-triceps-extension): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps.'
WHERE slug = 'standing-towel-triceps-extension' AND cue = 'Isolation push movement targeting triceps.';

-- Standing Two-Arm Overhead Throw (standing-two-arm-overhead-throw): vertical_press pattern, compound mechanic
UPDATE exercises SET cue = 'Compound push movement targeting front delts, side delts. Medicine ball.'
WHERE slug = 'standing-two-arm-overhead-throw' AND cue = 'Compound pull movement targeting front delts, side delts. Medicine ball.';

-- Star Jump (star-jump): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads.'
WHERE slug = 'star-jump' AND cue = 'Compound push movement targeting quads.';

-- Step-up with Knee Raise (step-up-with-knee-raise): lunge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound lunge movement targeting glutes.'
WHERE slug = 'step-up-with-knee-raise' AND cue = 'Compound push movement targeting glutes.';

-- Stiff-Legged Barbell Deadlift (stiff-legged-barbell-deadlift): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'stiff-legged-barbell-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Stiff-Legged Dumbbell Deadlift (stiff-legged-dumbbell-deadlift): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Dumbbells.'
WHERE slug = 'stiff-legged-dumbbell-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Dumbbells.';

-- Stiff Leg Barbell Good Morning (stiff-leg-barbell-good-morning): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Barbell, Rack.'
WHERE slug = 'stiff-leg-barbell-good-morning' AND cue = 'Compound push movement targeting lower back. Barbell, Rack.';

-- Straight-Arm Dumbbell Pullover (straight-arm-dumbbell-pullover): horizontal_press pattern, compound mechanic
UPDATE exercises SET cue = 'Compound push movement targeting chest. Dumbbells.'
WHERE slug = 'straight-arm-dumbbell-pullover' AND cue = 'Compound pull movement targeting chest. Dumbbells.';

-- Sumo Deadlift (sumo-deadlift): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'sumo-deadlift' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Sumo Deadlift with Bands (sumo-deadlift-with-bands): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'sumo-deadlift-with-bands' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Sumo Deadlift with Chains (sumo-deadlift-with-chains): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Barbell.'
WHERE slug = 'sumo-deadlift-with-chains' AND cue = 'Compound pull movement targeting hamstrings. Barbell.';

-- Supine Chest Throw (supine-chest-throw): triceps pattern, compound mechanic
UPDATE exercises SET cue = 'Compound triceps movement targeting triceps. Medicine ball.'
WHERE slug = 'supine-chest-throw' AND cue = 'Compound push movement targeting triceps. Medicine ball.';

-- Supine One-Arm Overhead Throw (supine-one-arm-overhead-throw): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Medicine ball.'
WHERE slug = 'supine-one-arm-overhead-throw' AND cue = 'Compound pull movement targeting abs. Medicine ball.';

-- Supine Two-Arm Overhead Throw (supine-two-arm-overhead-throw): core pattern, compound mechanic
UPDATE exercises SET cue = 'Compound core movement targeting abs. Medicine ball.'
WHERE slug = 'supine-two-arm-overhead-throw' AND cue = 'Compound pull movement targeting abs. Medicine ball.';

-- Tate Press (tate-press): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'tate-press' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Thigh Abductor (thigh-abductor): other pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation accessory movement targeting abductors. Machine.'
WHERE slug = 'thigh-abductor' AND cue = 'Isolation push movement targeting abductors. Machine.';

-- Thigh Adductor (thigh-adductor): other pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation accessory movement targeting adductors. Machine.'
WHERE slug = 'thigh-adductor' AND cue = 'Isolation pull movement targeting adductors. Machine.';

-- Tricep Dumbbell Kickback (tricep-dumbbell-kickback): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Dumbbells.'
WHERE slug = 'tricep-dumbbell-kickback' AND cue = 'Isolation push movement targeting triceps. Dumbbells.';

-- Triceps Overhead Extension with Rope (triceps-overhead-extension-with-rope): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'triceps-overhead-extension-with-rope' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Triceps Pushdown (triceps-pushdown): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'triceps-pushdown' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Triceps Pushdown - Rope Attachment (triceps-pushdown-rope-attachment): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'triceps-pushdown-rope-attachment' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Triceps Pushdown - V-Bar Attachment (triceps-pushdown-v-bar-attachment): triceps pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation triceps movement targeting triceps. Cable machine.'
WHERE slug = 'triceps-pushdown-v-bar-attachment' AND cue = 'Isolation push movement targeting triceps. Cable machine.';

-- Tuck Crunch (tuck-crunch): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs.'
WHERE slug = 'tuck-crunch' AND cue = 'Isolation pull movement targeting abs.';

-- Two-Arm Kettlebell Clean (two-arm-kettlebell-clean): vertical_press pattern, compound mechanic
UPDATE exercises SET cue = 'Compound push movement targeting front delts, side delts. Kettlebell.'
WHERE slug = 'two-arm-kettlebell-clean' AND cue = 'Compound pull movement targeting front delts, side delts. Kettlebell.';

-- Vertical Swing (vertical-swing): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting hamstrings. Dumbbells.'
WHERE slug = 'vertical-swing' AND cue = 'Compound pull movement targeting hamstrings. Dumbbells.';

-- Weighted Ball Hyperextension (weighted-ball-hyperextension): hinge pattern, compound mechanic
UPDATE exercises SET cue = 'Compound hinge movement targeting lower back. Stability ball.'
WHERE slug = 'weighted-ball-hyperextension' AND cue = 'Compound pull movement targeting lower back. Stability ball.';

-- Weighted Ball Side Bend (weighted-ball-side-bend): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Stability ball.'
WHERE slug = 'weighted-ball-side-bend' AND cue = 'Isolation pull movement targeting abs. Stability ball.';

-- Weighted Crunches (weighted-crunches): core pattern, isolation mechanic
UPDATE exercises SET cue = 'Isolation core movement targeting abs. Medicine ball.'
WHERE slug = 'weighted-crunches' AND cue = 'Isolation pull movement targeting abs. Medicine ball.';

-- Weighted Jump Squat (weighted-jump-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'weighted-jump-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Weighted Sissy Squat (weighted-sissy-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'weighted-sissy-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Wide-Grip Decline Barbell Pullover (wide-grip-decline-barbell-pullover): horizontal_press pattern, compound mechanic
UPDATE exercises SET cue = 'Compound push movement targeting chest. Bench, Barbell.'
WHERE slug = 'wide-grip-decline-barbell-pullover' AND cue = 'Compound pull movement targeting chest. Bench, Barbell.';

-- Wide Stance Barbell Squat (wide-stance-barbell-squat): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell, Rack.'
WHERE slug = 'wide-stance-barbell-squat' AND cue = 'Compound push movement targeting quads. Barbell, Rack.';

-- Wind Sprints (wind-sprints): cardio pattern, compound mechanic
UPDATE exercises SET cue = 'Compound cardio movement targeting abs.'
WHERE slug = 'wind-sprints' AND cue = 'Compound pull movement targeting abs.';

-- Zercher Squats (zercher-squats): squat pattern, compound mechanic
UPDATE exercises SET cue = 'Compound squat movement targeting quads. Barbell.'
WHERE slug = 'zercher-squats' AND cue = 'Compound push movement targeting quads. Barbell.';


-- ============================================================================
-- Part 2: Warmup Exercises - Fix dynamic moves mislabeled as stretches
-- ============================================================================
--
-- Cat-Cow Stretch is a dynamic mobility flow, not a static stretch.
-- It should use the 'mobility' type, not 'stretch' type.
-- Note: There are two separate exercises:
--   - 'cat-cow' (already correctly typed as 'mobility')
--   - 'cat-cow-stretch' (incorrectly typed as 'stretch', should be 'mobility')

UPDATE warmup_exercises 
SET type = 'mobility'
WHERE slug = 'cat-cow-stretch' AND type = 'stretch';

