#!/usr/bin/env tsx
/**
 * Test: input-step.ts logic
 * 
 * Covers:
 * - Every equipment type in kg and lb
 * - Kettlebell ladder up and down
 * - Between-bell values
 * - Clamps at min (0) and max (kettlebell ends)
 * - Float drift with 0.1 steps
 * - Multi-equipment rule (largest increment)
 */

import { stepFor, nextWeight, nextReps, REPS_STEP } from '../src/lib/session/input-step';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  -- ${detail}` : ''}`);
}

console.log('\n1. stepFor returns correct increments by equipment type');
{
  check('barbell kg is 2.5', stepFor(['barbell'], 'kg') === 2.5);
  check('barbell lb is 5', stepFor(['barbell'], 'lb') === 5);
  
  check('dumbbell kg is 2', stepFor(['dumbbell'], 'kg') === 2);
  check('dumbbell lb is 5', stepFor(['dumbbell'], 'lb') === 5);
  
  check('leg_press kg is 5', stepFor(['leg_press'], 'kg') === 5);
  check('leg_press lb is 10', stepFor(['leg_press'], 'lb') === 10);
  
  check('cable_machine kg is 5', stepFor(['cable_machine'], 'kg') === 5);
  check('cable_machine lb is 10', stepFor(['cable_machine'], 'lb') === 10);
  
  check('ez_bar kg is 2.5', stepFor(['ez_bar'], 'kg') === 2.5);
  check('trap_bar lb is 5', stepFor(['trap_bar'], 'lb') === 5);
  
  check('smith_machine kg is 5', stepFor(['smith_machine'], 'kg') === 5);
  check('lat_pulldown lb is 10', stepFor(['lat_pulldown'], 'lb') === 10);
  
  check('unknown equipment defaults to 2.5 kg', stepFor(['bodyweight'], 'kg') === 2.5);
  check('unknown equipment defaults to 5 lb', stepFor(['resistance_band'], 'lb') === 5);
}

console.log('\n2. Multi-equipment: largest increment wins');
{
  check('barbell + dumbbell uses barbell step (2.5 kg)', 
    stepFor(['barbell', 'dumbbell'], 'kg') === 2.5);
  
  check('dumbbell + machine uses machine step (5 kg)',
    stepFor(['dumbbell', 'leg_press'], 'kg') === 5);
  
  check('barbell + cable uses cable step (5 kg)',
    stepFor(['barbell', 'cable_machine'], 'kg') === 5);
}

console.log('\n3. nextWeight with standard equipment (step-based)');
{
  check('barbell increase from 20 kg', nextWeight(20, 1, ['barbell'], 'kg') === 22.5);
  check('barbell decrease from 20 kg', nextWeight(20, -1, ['barbell'], 'kg') === 17.5);
  
  check('dumbbell increase from 10 lb', nextWeight(10, 1, ['dumbbell'], 'lb') === 15);
  check('dumbbell decrease from 10 lb', nextWeight(10, -1, ['dumbbell'], 'lb') === 5);
  
  check('machine increase from 50 kg', nextWeight(50, 1, ['leg_press'], 'kg') === 55);
  check('machine decrease from 50 kg', nextWeight(50, -1, ['leg_press'], 'kg') === 45);
  
  check('clamps at 0', nextWeight(2, -1, ['barbell'], 'kg') === 0);
  check('zero stays at zero on decrease', nextWeight(0, -1, ['barbell'], 'kg') === 0);
}

console.log('\n4. nextWeight with float drift prevention');
{
  // Repeated small steps can accumulate drift
  let weight = 0;
  for (let i = 0; i < 10; i++) {
    weight = nextWeight(weight, 1, ['barbell'], 'kg');
  }
  check('10 steps of 2.5 kg = 25 kg (no drift)', weight === 25, `got ${weight}`);
  
  // Start from a value with potential float representation issues
  const start = 0.1;
  const stepped = nextWeight(start, 1, ['barbell'], 'kg');
  check('stepping from 0.1 snaps to grid', stepped === 2.5, `got ${stepped}`);
}

console.log('\n5. Kettlebell ladder in kg');
{
  check('4 kg → 6 kg', nextWeight(4, 1, ['kettlebell'], 'kg') === 6);
  check('6 kg → 8 kg', nextWeight(6, 1, ['kettlebell'], 'kg') === 8);
  check('20 kg → 24 kg', nextWeight(20, 1, ['kettlebell'], 'kg') === 24);
  check('28 kg → 32 kg', nextWeight(28, 1, ['kettlebell'], 'kg') === 32);
  
  check('32 kg → 28 kg (down)', nextWeight(32, -1, ['kettlebell'], 'kg') === 28);
  check('24 kg → 20 kg (down)', nextWeight(24, -1, ['kettlebell'], 'kg') === 20);
  check('8 kg → 6 kg (down)', nextWeight(8, -1, ['kettlebell'], 'kg') === 6);
  check('6 kg → 4 kg (down)', nextWeight(6, -1, ['kettlebell'], 'kg') === 4);
}

console.log('\n6. Kettlebell ladder in lb');
{
  check('10 lb → 15 lb', nextWeight(10, 1, ['kettlebell'], 'lb') === 15);
  check('35 lb → 40 lb', nextWeight(35, 1, ['kettlebell'], 'lb') === 40);
  check('60 lb → 70 lb', nextWeight(60, 1, ['kettlebell'], 'lb') === 70);
  
  check('70 lb → 60 lb (down)', nextWeight(70, -1, ['kettlebell'], 'lb') === 60);
  check('40 lb → 35 lb (down)', nextWeight(40, -1, ['kettlebell'], 'lb') === 35);
  check('15 lb → 10 lb (down)', nextWeight(15, -1, ['kettlebell'], 'lb') === 10);
}

console.log('\n7. Kettlebell between-bell values');
{
  check('7 kg (between 6 and 8) up → 8 kg', nextWeight(7, 1, ['kettlebell'], 'kg') === 8);
  check('7 kg (between 6 and 8) down → 6 kg', nextWeight(7, -1, ['kettlebell'], 'kg') === 6);
  
  check('22 kg (between 20 and 24) up → 24 kg', nextWeight(22, 1, ['kettlebell'], 'kg') === 24);
  check('22 kg (between 20 and 24) down → 20 kg', nextWeight(22, -1, ['kettlebell'], 'kg') === 20);
  
  check('17 lb (between 15 and 20) up → 20 lb', nextWeight(17, 1, ['kettlebell'], 'lb') === 20);
  check('17 lb (between 15 and 20) down → 15 lb', nextWeight(17, -1, ['kettlebell'], 'lb') === 15);
}

console.log('\n8. Kettlebell clamps at ends');
{
  check('at max (32 kg), increase stays at 32 kg', nextWeight(32, 1, ['kettlebell'], 'kg') === 32);
  check('above max (35 kg), increase stays at 32 kg', nextWeight(35, 1, ['kettlebell'], 'kg') === 32);
  
  check('at min (4 kg), decrease stays at 4 kg', nextWeight(4, -1, ['kettlebell'], 'kg') === 4);
  check('below min (2 kg), decrease stays at 4 kg', nextWeight(2, -1, ['kettlebell'], 'kg') === 4);
  
  check('at max (80 lb), increase stays at 80 lb', nextWeight(80, 1, ['kettlebell'], 'lb') === 80);
  check('at min (5 lb), decrease stays at 5 lb', nextWeight(5, -1, ['kettlebell'], 'lb') === 5);
}

console.log('\n9. Kettlebell ladder immutability (no mutation of shared constant)');
{
  // Call decrease twice, then increase - ladder should work correctly throughout
  const start = 20;
  const down1 = nextWeight(start, -1, ['kettlebell'], 'kg');
  check('first decrease: 20 kg → 18 kg', down1 === 18);
  
  const down2 = nextWeight(down1, -1, ['kettlebell'], 'kg');
  check('second decrease: 18 kg → 16 kg', down2 === 16);
  
  const up = nextWeight(down2, 1, ['kettlebell'], 'kg');
  check('increase after two decreases: 16 kg → 18 kg', up === 18);
  
  // Verify the ladder still works from the original starting point
  const freshDown = nextWeight(start, -1, ['kettlebell'], 'kg');
  check('ladder unchanged: 20 kg → 18 kg still works', freshDown === 18);
}

console.log('\n10. nextReps logic');
{
  check('REPS_STEP is 1', REPS_STEP === 1);
  
  check('increase from 5', nextReps(5, 1, { min: 1, max: 20 }) === 6);
  check('decrease from 5', nextReps(5, -1, { min: 1, max: 20 }) === 4);
  
  check('clamps at min', nextReps(1, -1, { min: 1, max: 20 }) === 1);
  check('clamps at max', nextReps(20, 1, { min: 1, max: 20 }) === 20);
  
  check('increase from max stays at max', nextReps(20, 1, { min: 1, max: 20 }) === 20);
  check('decrease from min stays at min', nextReps(1, -1, { min: 1, max: 20 }) === 1);
}

console.log('\n11. Race condition: step from typed value, not stale prop');
{
  // Simulates the user typing '62' and tapping + before blur commits it.
  // The component should step from 62, not from the stale value.
  const staleprop = 50;
  const typedValue = 62;
  
  // Step from the typed value (what the component now does)
  // 62 + 2.5 = 64.5, snapped to grid = 65
  const correctNext = nextWeight(typedValue, 1, ['barbell'], 'kg');
  check('steps from typed 62 (snaps to 65)', correctNext === 65, `got ${correctNext}`);
  
  // Wrong behavior would step from stale prop
  const wrongNext = nextWeight(staleprop, 1, ['barbell'], 'kg');
  check('stepping from stale 50 would give 52.5', wrongNext === 52.5, `got ${wrongNext}`);
  check('correct result differs from wrong result', correctNext !== wrongNext);
  
  // Same for reps
  const typedReps = 10;
  const staleReps = 8;
  const correctRepsNext = nextReps(typedReps, 1, { min: 1, max: 20 });
  const wrongRepsNext = nextReps(staleReps, 1, { min: 1, max: 20 });
  check('reps: steps from typed 10, not stale 8', correctRepsNext === 11, `got ${correctRepsNext}`);
  check('reps: wrong would be 9', wrongRepsNext === 9, `got ${wrongRepsNext}`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
