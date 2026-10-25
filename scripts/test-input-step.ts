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

import { stepFor, nextWeight, nextReps, REPS_STEP, KETTLEBELL_WEIGHTS_KG, KETTLEBELL_WEIGHTS_LB } from '../src/lib/session/input-step';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  -- ${detail}` : ''}`);
}

console.log('\n1. stepFor returns correct increments by equipment type (MEDIUM 2)');
{
  check('barbell kg is 2.5', stepFor(['barbell'], 'kg') === 2.5);
  check('barbell lb is 5', stepFor(['barbell'], 'lb') === 5);
  
  check('dumbbell kg is 2.5 (FIXED from 2)', stepFor(['dumbbell'], 'kg') === 2.5);
  check('dumbbell lb is 5', stepFor(['dumbbell'], 'lb') === 5);
  
  check('leg_curl kg is 5 (pin-stack machines)', stepFor(['leg_curl'], 'kg') === 5);
  check('leg_curl lb is 10 (pin-stack machines)', stepFor(['leg_curl'], 'lb') === 10);
  
  check('machine_generic kg is 5 (pin-stack machines)', stepFor(['machine_generic'], 'kg') === 5);
  check('machine_generic lb is 10 (pin-stack machines)', stepFor(['machine_generic'], 'lb') === 10);
  
  check('cable_machine kg is 2.5', stepFor(['cable_machine'], 'kg') === 2.5);
  check('cable_machine lb is 5', stepFor(['cable_machine'], 'lb') === 5);
  
  check('ez_bar kg is 2.5', stepFor(['ez_bar'], 'kg') === 2.5);
  check('trap_bar lb is 5', stepFor(['trap_bar'], 'lb') === 5);
  
  check('smith_machine kg is 2.5 (plate-loaded machines)', stepFor(['smith_machine'], 'kg') === 2.5);
  check('leg_press kg is 2.5 (plate-loaded machines)', stepFor(['leg_press'], 'kg') === 2.5);
  check('lat_pulldown lb is 10 (pin-stack machines)', stepFor(['lat_pulldown'], 'lb') === 10);
  
  check('unknown equipment defaults to 2.5 kg', stepFor(['bodyweight'], 'kg') === 2.5);
  check('unknown equipment defaults to 5 lb', stepFor(['resistance_band'], 'lb') === 5);
}

console.log('\n2. Multi-equipment: largest increment wins (MEDIUM 2)');
{
  check('barbell + dumbbell uses 2.5 kg (both same now)', 
    stepFor(['barbell', 'dumbbell'], 'kg') === 2.5);
  
  check('dumbbell + pin-stack machine uses 5 kg (machine is larger)',
    stepFor(['dumbbell', 'leg_curl'], 'kg') === 5);
  
  check('dumbbell + plate-loaded machine uses 2.5 kg (both same)',
    stepFor(['dumbbell', 'smith_machine'], 'kg') === 2.5);
  
  check('barbell + cable uses 2.5 kg (both same now)',
    stepFor(['barbell', 'cable_machine'], 'kg') === 2.5);
}

console.log('\n3. nextWeight with standard equipment (step-based)');
{
  check('barbell increase from 20 kg', nextWeight(20, 1, ['barbell'], 'kg') === 22.5);
  check('barbell decrease from 20 kg', nextWeight(20, -1, ['barbell'], 'kg') === 17.5);
  
  check('dumbbell increase from 10 lb', nextWeight(10, 1, ['dumbbell'], 'lb') === 15);
  check('dumbbell decrease from 10 lb', nextWeight(10, -1, ['dumbbell'], 'lb') === 5);
  
  check('pin-stack machine increase from 50 kg (now 5 step)', nextWeight(50, 1, ['leg_curl'], 'kg') === 55);
  check('pin-stack machine decrease from 50 kg (now 5 step)', nextWeight(50, -1, ['leg_curl'], 'kg') === 45);
  
  check('clamps at 0', nextWeight(2, -1, ['barbell'], 'kg') === 0);
  check('zero stays at zero on decrease', nextWeight(0, -1, ['barbell'], 'kg') === 0);
}

console.log('\n4. nextWeight with off-grid snapping (MEDIUM 2)');
{
  // On-grid: one tap moves one increment, and up then down returns to start
  check('22.5 kg up → 25 kg', nextWeight(22.5, 1, ['barbell'], 'kg') === 25);
  check('25 kg down → 22.5 kg (reversibility)', nextWeight(25, -1, ['barbell'], 'kg') === 22.5);
  
  // Off-grid: snap to nearest grid point in the direction
  check('23 kg up → 25 kg (snap up)', nextWeight(23, 1, ['barbell'], 'kg') === 25);
  check('23 kg down → 22.5 kg (snap down)', nextWeight(23, -1, ['barbell'], 'kg') === 22.5);
  
  check('21 kg up → 22.5 kg (snap up)', nextWeight(21, 1, ['barbell'], 'kg') === 22.5);
  check('21 kg down → 20 kg (snap down)', nextWeight(21, -1, ['barbell'], 'kg') === 20);
  
  // Verify reversibility from on-grid positions
  check('20 kg up → 22.5 kg', nextWeight(20, 1, ['barbell'], 'kg') === 22.5);
  check('22.5 kg down → 20 kg', nextWeight(22.5, -1, ['barbell'], 'kg') === 20);
  
  // Test with different equipment
  check('12 lb (off-grid) up → 15 lb', nextWeight(12, 1, ['dumbbell'], 'lb') === 15);
  check('12 lb (off-grid) down → 10 lb', nextWeight(12, -1, ['dumbbell'], 'lb') === 10);
}

console.log('\n6. nextWeight with float drift prevention');
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

console.log('\n7. Kettlebell weights arrays are exported as readonly');
{
  check('KETTLEBELL_WEIGHTS_KG is exported and has 15 bells', 
    KETTLEBELL_WEIGHTS_KG.length === 15);
  check('KETTLEBELL_WEIGHTS_LB is exported and has 14 bells',
    KETTLEBELL_WEIGHTS_LB.length === 14);
  check('kg array starts at 4 kg', KETTLEBELL_WEIGHTS_KG[0] === 4);
  check('kg array ends at 48 kg', KETTLEBELL_WEIGHTS_KG[KETTLEBELL_WEIGHTS_KG.length - 1] === 48);
  check('lb array starts at 5 lb', KETTLEBELL_WEIGHTS_LB[0] === 5);
  check('lb array ends at 80 lb', KETTLEBELL_WEIGHTS_LB[KETTLEBELL_WEIGHTS_LB.length - 1] === 80);
  
  // Runtime check: arrays are frozen (immutable)
  // readonly type (TypeScript) + Object.freeze() (runtime) prevent mutation
  check('kg array is frozen (Object.isFrozen)', Object.isFrozen(KETTLEBELL_WEIGHTS_KG));
  check('lb array is frozen (Object.isFrozen)', Object.isFrozen(KETTLEBELL_WEIGHTS_LB));
  
  // Object.isFrozen confirms arrays cannot be mutated at runtime
  // TypeScript readonly type prevents mutation at compile time
  check('kg array values unchanged', KETTLEBELL_WEIGHTS_KG[0] === 4 && KETTLEBELL_WEIGHTS_KG[11] === 32);
  check('lb array values unchanged', KETTLEBELL_WEIGHTS_LB[0] === 5 && KETTLEBELL_WEIGHTS_LB[13] === 80);
}

console.log('\n8. Kettlebell ladder in kg');
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

console.log('\n9. Kettlebell ladder in lb');
{
  check('10 lb → 15 lb', nextWeight(10, 1, ['kettlebell'], 'lb') === 15);
  check('35 lb → 40 lb', nextWeight(35, 1, ['kettlebell'], 'lb') === 40);
  check('60 lb → 70 lb', nextWeight(60, 1, ['kettlebell'], 'lb') === 70);
  
  check('70 lb → 60 lb (down)', nextWeight(70, -1, ['kettlebell'], 'lb') === 60);
  check('40 lb → 35 lb (down)', nextWeight(40, -1, ['kettlebell'], 'lb') === 35);
  check('15 lb → 10 lb (down)', nextWeight(15, -1, ['kettlebell'], 'lb') === 10);
}

console.log('\n10. Kettlebell between-bell values');
{
  check('7 kg (between 6 and 8) up → 8 kg', nextWeight(7, 1, ['kettlebell'], 'kg') === 8);
  check('7 kg (between 6 and 8) down → 6 kg', nextWeight(7, -1, ['kettlebell'], 'kg') === 6);
  
  check('22 kg (between 20 and 24) up → 24 kg', nextWeight(22, 1, ['kettlebell'], 'kg') === 24);
  check('22 kg (between 20 and 24) down → 20 kg', nextWeight(22, -1, ['kettlebell'], 'kg') === 20);
  
  check('17 lb (between 15 and 20) up → 20 lb', nextWeight(17, 1, ['kettlebell'], 'lb') === 20);
  check('17 lb (between 15 and 20) down → 15 lb', nextWeight(17, -1, ['kettlebell'], 'lb') === 15);
}

console.log('\n11. Kettlebell clamps at ends (LOW a)');
{
  check('at max (48 kg), increase stays at 48 kg', nextWeight(48, 1, ['kettlebell'], 'kg') === 48);
  check('above max (50 kg), increase stays at 48 kg', nextWeight(50, 1, ['kettlebell'], 'kg') === 48);
  
  check('at min (4 kg), decrease stays at 4 kg (FIXED)', nextWeight(4, -1, ['kettlebell'], 'kg') === 4);
  check('below min (2 kg), increase goes to 4 kg (FIXED)', nextWeight(2, 1, ['kettlebell'], 'kg') === 4);
  check('below min (2 kg), decrease stays at 2 kg (FIXED)', nextWeight(2, -1, ['kettlebell'], 'kg') === 2);
  
  check('at max (80 lb), increase stays at 80 lb', nextWeight(80, 1, ['kettlebell'], 'lb') === 80);
  check('at min (5 lb), decrease stays at 5 lb (FIXED)', nextWeight(5, -1, ['kettlebell'], 'lb') === 5);
  check('below min (3 lb), increase goes to 5 lb (FIXED)', nextWeight(3, 1, ['kettlebell'], 'lb') === 5);
  check('below min (3 lb), decrease stays at 3 lb (FIXED)', nextWeight(3, -1, ['kettlebell'], 'lb') === 3);
}

console.log('\n12. Kettlebell ladder immutability (no mutation of shared constant)');
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

console.log('\n13. nextReps logic');
{
  check('REPS_STEP is 1', REPS_STEP === 1);
  
  check('increase from 5', nextReps(5, 1, { min: 1, max: 20 }) === 6);
  check('decrease from 5', nextReps(5, -1, { min: 1, max: 20 }) === 4);
  
  check('clamps at min', nextReps(1, -1, { min: 1, max: 20 }) === 1);
  check('clamps at max', nextReps(20, 1, { min: 1, max: 20 }) === 20);
  
  check('increase from max stays at max', nextReps(20, 1, { min: 1, max: 20 }) === 20);
  check('decrease from min stays at min', nextReps(1, -1, { min: 1, max: 20 }) === 1);
}

console.log('\n13. Imperial unit stepping (MEDIUM 2, with src/lib/units.ts)');
{
  // 5 lb step matches 2.5 kg × 2.2046 ≈ 5.51 lb (practical gym increment)
  check('barbell imperial: 100 lb → 105 lb', nextWeight(100, 1, ['barbell'], 'lb') === 105);
  check('barbell imperial: 105 lb → 100 lb', nextWeight(105, -1, ['barbell'], 'lb') === 100);
  
  check('dumbbell imperial: 20 lb → 25 lb', nextWeight(20, 1, ['dumbbell'], 'lb') === 25);
  check('dumbbell imperial: 25 lb → 20 lb', nextWeight(25, -1, ['dumbbell'], 'lb') === 20);
  
  // Off-grid snapping in imperial (same rules as metric)
  check('102 lb (off-grid) up → 105 lb', nextWeight(102, 1, ['barbell'], 'lb') === 105);
  check('102 lb (off-grid) down → 100 lb', nextWeight(102, -1, ['barbell'], 'lb') === 100);
  
  check('103 lb (off-grid) up → 105 lb', nextWeight(103, 1, ['barbell'], 'lb') === 105);
  check('103 lb (off-grid) down → 100 lb', nextWeight(103, -1, ['barbell'], 'lb') === 100);
  
  // Reversibility check
  const weight = 100;
  const up = nextWeight(weight, 1, ['barbell'], 'lb');
  const down = nextWeight(up, -1, ['barbell'], 'lb');
  check('imperial reversibility: 100 lb → 105 lb → 100 lb', down === weight);
}

console.log('\n15. Race condition: step from typed value, not stale prop (MEDIUM 1)');
{
  // Simulates the user typing '62' and tapping + before blur commits it.
  // The component should step from 62, not from the stale value.
  const staleprop = 50;
  const typedValue = 62;
  
  // Step from the typed value (what the component now does)
  // 62 is off-grid (62 / 2.5 = 24.8), so it snaps to next grid point = 62.5
  const correctNext = nextWeight(typedValue, 1, ['barbell'], 'kg');
  check('steps from typed 62 (snaps to 62.5, the next grid point)', correctNext === 62.5, `got ${correctNext}`);
  
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
