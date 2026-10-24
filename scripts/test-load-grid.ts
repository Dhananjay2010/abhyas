#!/usr/bin/env tsx
/**
 * Test: equipment-grid.ts logic
 * 
 * Covers:
 * - roundToEquipmentGrid for each equipment type (barbell, dumbbell, cable, machine, kettlebell)
 * - Both kg and lb units
 * - Ties round DOWN (e.g., 11.25 kg on 2.5 kg grid becomes 10 kg)
 * - Small, negative, and NaN inputs
 * - Kettlebell snapping to nearest bell
 * - Float precision (epsilon-safe: 0.1+0.2 style inputs land exactly on grid)
 * - Sweep test: every output from 0..200 in 0.25 steps is on-grid
 * - nextWeight from any grid value stays on-grid
 */

import { roundToEquipmentGrid, gridStepFor, KETTLEBELL_WEIGHTS_KG, KETTLEBELL_WEIGHTS_LB, kettlebellBounds } from '../src/lib/session/equipment-grid';
import { nextWeight } from '../src/lib/session/input-step';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  -- ${detail}` : ''}`);
}

console.log('\n1. gridStepFor returns correct increments');
{
  check('barbell kg is 2.5', gridStepFor(['barbell'], 'kg') === 2.5);
  check('barbell lb is 5', gridStepFor(['barbell'], 'lb') === 5);
  
  check('dumbbell kg is 2.5', gridStepFor(['dumbbell'], 'kg') === 2.5);
  check('dumbbell lb is 5', gridStepFor(['dumbbell'], 'lb') === 5);
  
  check('cable kg is 2.5', gridStepFor(['cable_machine'], 'kg') === 2.5);
  check('cable lb is 5', gridStepFor(['cable_machine'], 'lb') === 5);
  
  check('leg_curl kg is 5 (pin-stack)', gridStepFor(['leg_curl'], 'kg') === 5);
  check('leg_curl lb is 10 (pin-stack)', gridStepFor(['leg_curl'], 'lb') === 10);
  
  check('machine_generic kg is 5 (pin-stack)', gridStepFor(['machine_generic'], 'kg') === 5);
  check('machine_generic lb is 10 (pin-stack)', gridStepFor(['machine_generic'], 'lb') === 10);
  
  check('leg_press kg is 2.5 (plate-loaded)', gridStepFor(['leg_press'], 'kg') === 2.5);
  check('smith_machine kg is 2.5 (plate-loaded)', gridStepFor(['smith_machine'], 'kg') === 2.5);
  check('lat_pulldown lb is 10 (pin-stack)', gridStepFor(['lat_pulldown'], 'lb') === 10);
}

console.log('\n2. roundToEquipmentGrid - barbell kg');
{
  check('20 kg on-grid', roundToEquipmentGrid(20, ['barbell'], 'kg') === 20);
  check('22.5 kg on-grid', roundToEquipmentGrid(22.5, ['barbell'], 'kg') === 22.5);
  check('25 kg on-grid', roundToEquipmentGrid(25, ['barbell'], 'kg') === 25);
  
  check('21 kg → 20 kg (nearest)', roundToEquipmentGrid(21, ['barbell'], 'kg') === 20);
  check('22 kg → 22.5 kg (nearest)', roundToEquipmentGrid(22, ['barbell'], 'kg') === 22.5);
  check('23.5 kg → 22.5 kg (nearest)', roundToEquipmentGrid(23.5, ['barbell'], 'kg') === 22.5);
  check('23.8 kg → 25 kg (nearest)', roundToEquipmentGrid(23.8, ['barbell'], 'kg') === 25);
}

console.log('\n3. roundToEquipmentGrid - ties round DOWN');
{
  // Exactly halfway between grid points should round down
  check('11.25 kg tie → 10 kg (down)', roundToEquipmentGrid(11.25, ['barbell'], 'kg') === 10);
  check('13.75 kg tie → 12.5 kg (down)', roundToEquipmentGrid(13.75, ['barbell'], 'kg') === 12.5);
  check('21.25 kg tie → 20 kg (down)', roundToEquipmentGrid(21.25, ['barbell'], 'kg') === 20);
  
  check('12.5 lb tie → 10 lb (down)', roundToEquipmentGrid(12.5, ['dumbbell'], 'lb') === 10);
  check('17.5 lb tie → 15 lb (down)', roundToEquipmentGrid(17.5, ['dumbbell'], 'lb') === 15);
}

console.log('\n4. roundToEquipmentGrid - dumbbell lb');
{
  check('10 lb on-grid', roundToEquipmentGrid(10, ['dumbbell'], 'lb') === 10);
  check('15 lb on-grid', roundToEquipmentGrid(15, ['dumbbell'], 'lb') === 15);
  
  check('12 lb → 10 lb (nearest)', roundToEquipmentGrid(12, ['dumbbell'], 'lb') === 10);
  check('13 lb → 15 lb (nearest)', roundToEquipmentGrid(13, ['dumbbell'], 'lb') === 15);
  check('17 lb → 15 lb (nearest)', roundToEquipmentGrid(17, ['dumbbell'], 'lb') === 15);
}

console.log('\n5. roundToEquipmentGrid - cable machine');
{
  check('20 kg on-grid', roundToEquipmentGrid(20, ['cable_machine'], 'kg') === 20);
  check('22.5 kg on-grid', roundToEquipmentGrid(22.5, ['cable_machine'], 'kg') === 22.5);
  
  check('21 kg → 20 kg (nearest)', roundToEquipmentGrid(21, ['cable_machine'], 'kg') === 20);
  check('23 kg → 22.5 kg (nearest)', roundToEquipmentGrid(23, ['cable_machine'], 'kg') === 22.5);
}

console.log('\n6. roundToEquipmentGrid - pin-stack machines (5 kg / 10 lb)');
{
  check('50 kg on-grid', roundToEquipmentGrid(50, ['leg_curl'], 'kg') === 50);
  check('55 kg on-grid', roundToEquipmentGrid(55, ['leg_curl'], 'kg') === 55);
  
  check('52 kg → 50 kg (nearest)', roundToEquipmentGrid(52, ['leg_curl'], 'kg') === 50);
  check('53 kg → 55 kg (nearest)', roundToEquipmentGrid(53, ['leg_curl'], 'kg') === 55);
  check('57.5 kg tie → 55 kg (down)', roundToEquipmentGrid(57.5, ['leg_curl'], 'kg') === 55);
  
  check('100 lb on-grid', roundToEquipmentGrid(100, ['lat_pulldown'], 'lb') === 100);
  check('110 lb on-grid', roundToEquipmentGrid(110, ['lat_pulldown'], 'lb') === 110);
  
  check('105 lb tie → 100 lb (down)', roundToEquipmentGrid(105, ['lat_pulldown'], 'lb') === 100);
  check('107 lb → 110 lb (nearest)', roundToEquipmentGrid(107, ['lat_pulldown'], 'lb') === 110);
  
  check('machine_generic 52 kg → 50 kg', roundToEquipmentGrid(52, ['machine_generic'], 'kg') === 50);
  check('machine_generic 107 lb → 110 lb', roundToEquipmentGrid(107, ['machine_generic'], 'lb') === 110);
}

console.log('\n6a. roundToEquipmentGrid - plate-loaded machines (2.5 kg / 5 lb)');
{
  check('smith_machine 50 kg on-grid', roundToEquipmentGrid(50, ['smith_machine'], 'kg') === 50);
  check('smith_machine 52.5 kg on-grid', roundToEquipmentGrid(52.5, ['smith_machine'], 'kg') === 52.5);
  check('smith_machine 51 kg → 50 kg', roundToEquipmentGrid(51, ['smith_machine'], 'kg') === 50);
  check('smith_machine 52 kg → 52.5 kg', roundToEquipmentGrid(52, ['smith_machine'], 'kg') === 52.5);
  
  check('leg_press 100 kg on-grid', roundToEquipmentGrid(100, ['leg_press'], 'kg') === 100);
  check('leg_press 101 kg → 100 kg', roundToEquipmentGrid(101, ['leg_press'], 'kg') === 100);
}

console.log('\n7. roundToEquipmentGrid - kettlebell kg');
{
  check('8 kg on-grid', roundToEquipmentGrid(8, ['kettlebell'], 'kg') === 8);
  check('16 kg on-grid', roundToEquipmentGrid(16, ['kettlebell'], 'kg') === 16);
  
  check('7 kg tie (between 6 and 8) → 6 kg', roundToEquipmentGrid(7, ['kettlebell'], 'kg') === 6);
  check('9 kg → 8 kg (nearest)', roundToEquipmentGrid(9, ['kettlebell'], 'kg') === 8);
  check('11 kg tie (between 10 and 12) → 10 kg', roundToEquipmentGrid(11, ['kettlebell'], 'kg') === 10);
  
  check('17 kg tie (between 16 and 18) → 16 kg', roundToEquipmentGrid(17, ['kettlebell'], 'kg') === 16);
  check('22 kg tie (between 20 and 24) → 20 kg', roundToEquipmentGrid(22, ['kettlebell'], 'kg') === 20);
  
  // Clamp to bounds
  check('below min (2 kg) → 4 kg', roundToEquipmentGrid(2, ['kettlebell'], 'kg') === 4);
  check('above max (40 kg) → 32 kg', roundToEquipmentGrid(40, ['kettlebell'], 'kg') === 32);
}

console.log('\n8. roundToEquipmentGrid - kettlebell lb');
{
  check('20 lb on-grid', roundToEquipmentGrid(20, ['kettlebell'], 'lb') === 20);
  check('35 lb on-grid', roundToEquipmentGrid(35, ['kettlebell'], 'lb') === 35);
  
  check('17 lb → 15 lb (nearest)', roundToEquipmentGrid(17, ['kettlebell'], 'lb') === 15);
  check('18 lb → 20 lb (nearest)', roundToEquipmentGrid(18, ['kettlebell'], 'lb') === 20);
  check('32 lb → 30 lb (nearest)', roundToEquipmentGrid(32, ['kettlebell'], 'lb') === 30);
  
  // Ties round down
  check('17.5 lb tie (between 15 and 20) → 15 lb', roundToEquipmentGrid(17.5, ['kettlebell'], 'lb') === 15);
  check('42.5 lb tie (between 40 and 45) → 40 lb', roundToEquipmentGrid(42.5, ['kettlebell'], 'lb') === 40);
  
  // Clamp to bounds
  check('below min (3 lb) → 5 lb', roundToEquipmentGrid(3, ['kettlebell'], 'lb') === 5);
  check('above max (100 lb) → 80 lb', roundToEquipmentGrid(100, ['kettlebell'], 'lb') === 80);
}

console.log('\n9. roundToEquipmentGrid - non-finite and negative inputs');
{
  check('NaN → 0', roundToEquipmentGrid(NaN, ['barbell'], 'kg') === 0);
  check('Infinity → 0', roundToEquipmentGrid(Infinity, ['barbell'], 'kg') === 0);
  check('-Infinity → 0', roundToEquipmentGrid(-Infinity, ['barbell'], 'kg') === 0);
  check('negative value (-10) → 0', roundToEquipmentGrid(-10, ['barbell'], 'kg') === 0);
  check('negative small value (-0.5) → 0', roundToEquipmentGrid(-0.5, ['dumbbell'], 'lb') === 0);
  
  // Kettlebell non-finite: returns min bell
  const minKg = kettlebellBounds('kg').min;
  const minLb = kettlebellBounds('lb').min;
  check('kettlebell NaN → min bell (kg)', roundToEquipmentGrid(NaN, ['kettlebell'], 'kg') === minKg);
  check('kettlebell negative → min bell (lb)', roundToEquipmentGrid(-5, ['kettlebell'], 'lb') === minLb);
}

console.log('\n9a. roundToEquipmentGrid - bodyweight-only returns 0');
{
  check('empty array returns 0 (kg)', roundToEquipmentGrid(100, [], 'kg') === 0);
  check('empty array returns 0 (lb)', roundToEquipmentGrid(100, [], 'lb') === 0);
  
  check('bodyweight only returns 0 (kg)', roundToEquipmentGrid(100, ['bodyweight'], 'kg') === 0);
  check('bodyweight only returns 0 (lb)', roundToEquipmentGrid(100, ['bodyweight'], 'lb') === 0);
  
  check('pull_up_bar only returns 0 (kg)', roundToEquipmentGrid(50, ['pull_up_bar'], 'kg') === 0);
  check('dip_bars only returns 0 (lb)', roundToEquipmentGrid(50, ['dip_bars'], 'lb') === 0);
  
  check('yoga_mat only returns 0 (kg)', roundToEquipmentGrid(25, ['yoga_mat'], 'kg') === 0);
  
  check('bodyweight + pull_up_bar returns 0', roundToEquipmentGrid(75, ['bodyweight', 'pull_up_bar'], 'kg') === 0);
}

console.log('\n10. roundToEquipmentGrid - float precision (epsilon-safe)');
{
  // Test that only true ties round down, not near-ties
  check('11.2549 kg → 12.5 kg (above midpoint)', roundToEquipmentGrid(11.2549, ['dumbbell'], 'kg') === 12.5);
  check('11.25 kg tie → 10 kg (down)', roundToEquipmentGrid(11.25, ['dumbbell'], 'kg') === 10);
  check('11.25 + 1e-12 kg tie → 10 kg (within epsilon)', roundToEquipmentGrid(11.25 + 1e-12, ['dumbbell'], 'kg') === 10);
  check('0.1 + 0.2 + 11.0 = 11.3 → 12.5 kg', roundToEquipmentGrid(0.1 + 0.2 + 11.0, ['dumbbell'], 'kg') === 12.5);
  
  // 0.1 + 0.2 = 0.30000000000000004 in JavaScript
  const floatSum = 0.1 + 0.2;
  const rounded = roundToEquipmentGrid(floatSum, ['barbell'], 'kg');
  check('0.1 + 0.2 snaps to grid', rounded === 0 || rounded === 2.5, `got ${rounded}`);
  
  // Repeated addition can accumulate drift
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += 0.1;
  }
  const roundedSum = roundToEquipmentGrid(sum, ['barbell'], 'kg');
  check('10 × 0.1 snaps to grid', roundedSum === 0 || roundedSum === 2.5, `got ${roundedSum}`);
  
  // Near-grid values with float drift
  const nearGrid = 20.00000000001;
  check('20.00000000001 → 20', roundToEquipmentGrid(nearGrid, ['barbell'], 'kg') === 20);
}

console.log('\n11. roundToEquipmentGrid - multi-equipment precedence');
{
  // Should use the largest step (most conservative)
  check('barbell + dumbbell uses 2.5 kg', roundToEquipmentGrid(21, ['barbell', 'dumbbell'], 'kg') === 20);
  check('dumbbell + pin-stack machine uses 5 kg step', roundToEquipmentGrid(52, ['dumbbell', 'leg_curl'], 'kg') === 50);
  check('dumbbell + plate-loaded machine uses 2.5 kg', roundToEquipmentGrid(51, ['dumbbell', 'smith_machine'], 'kg') === 50);
  check('barbell + cable uses 2.5 kg', roundToEquipmentGrid(21, ['barbell', 'cable_machine'], 'kg') === 20);
  
  // Pin-stack machine should win with its 5 kg step
  const result = roundToEquipmentGrid(52.5, ['dumbbell', 'leg_curl'], 'kg');
  check('dumbbell + pin-stack machine tie 52.5 kg → 50 kg (5 kg step, down)', result === 50, `got ${result}`);
}

console.log('\n12. Sweep test: all outputs 0..200 in 0.25 steps are on-grid');
{
  let offGridCount = 0;
  const testCases: Array<{ equipmentIds: string[]; unit: 'kg' | 'lb'; step: number }> = [
    { equipmentIds: ['barbell'], unit: 'kg', step: 2.5 },
    { equipmentIds: ['dumbbell'], unit: 'lb', step: 5 },
    { equipmentIds: ['cable_machine'], unit: 'kg', step: 2.5 },
    { equipmentIds: ['leg_curl'], unit: 'kg', step: 5 },
    { equipmentIds: ['lat_pulldown'], unit: 'lb', step: 10 },
  ];
  
  for (const { equipmentIds, unit, step } of testCases) {
    for (let i = 0; i <= 200; i += 0.25) {
      const rounded = roundToEquipmentGrid(i, equipmentIds, unit);
      // Use exact comparison: rounded should equal k * step for some integer k
      const multiple = Math.round(rounded / step);
      const expected = multiple * step;
      if (Math.abs(rounded - expected) > 1e-10) {
        offGridCount++;
        if (offGridCount <= 3) {
          console.log(`    FAIL: ${i} ${unit} on ${equipmentIds[0]} → ${rounded} (expected ${expected}, off by ${Math.abs(rounded - expected)})`);
        }
      }
    }
  }
  check(`sweep 0..200 in 0.25 steps (${testCases.length} equipment types)`, offGridCount === 0, 
    offGridCount > 0 ? `${offGridCount} off-grid results` : '');
}

console.log('\n13. Sweep test: kettlebells snap to standard bells');
{
  let offBellCount = 0;
  const kgBells = KETTLEBELL_WEIGHTS_KG;
  const lbBells = KETTLEBELL_WEIGHTS_LB;
  
  // Test kg
  for (let i = 0; i <= 200; i += 0.25) {
    const rounded = roundToEquipmentGrid(i, ['kettlebell'], 'kg');
    if (!kgBells.includes(rounded)) {
      offBellCount++;
      if (offBellCount <= 3) {
        console.log(`    FAIL: ${i} kg kettlebell → ${rounded} (not a standard bell)`);
      }
    }
  }
  
  // Test lb
  for (let i = 0; i <= 200; i += 0.25) {
    const rounded = roundToEquipmentGrid(i, ['kettlebell'], 'lb');
    if (!lbBells.includes(rounded)) {
      offBellCount++;
      if (offBellCount <= 3) {
        console.log(`    FAIL: ${i} lb kettlebell → ${rounded} (not a standard bell)`);
      }
    }
  }
  
  check('sweep 0..200 kettlebells snap to standard bells', offBellCount === 0, 
    offBellCount > 0 ? `${offBellCount} off-bell results` : '');
}

console.log('\n14. nextWeight from any grid value stays on-grid');
{
  let offGridCount = 0;
  const testCases: Array<{ equipmentIds: string[]; unit: 'kg' | 'lb'; step: number; max: number }> = [
    { equipmentIds: ['barbell'], unit: 'kg', step: 2.5, max: 200 },
    { equipmentIds: ['dumbbell'], unit: 'lb', step: 5, max: 200 },
    { equipmentIds: ['cable_machine'], unit: 'kg', step: 2.5, max: 100 },
    { equipmentIds: ['leg_curl'], unit: 'kg', step: 5, max: 200 },
    { equipmentIds: ['lat_pulldown'], unit: 'lb', step: 10, max: 200 },
  ];
  
  for (const { equipmentIds, unit, step, max } of testCases) {
    // Start from each grid value and step up
    for (let value = 0; value <= max; value += step) {
      const next = nextWeight(value, 1, equipmentIds, unit);
      // Use exact comparison: next should equal k * step for some integer k
      const multiple = Math.round(next / step);
      const expected = multiple * step;
      if (Math.abs(next - expected) > 1e-10 && next !== 0) {
        offGridCount++;
        if (offGridCount <= 3) {
          console.log(`    FAIL: ${value} ${unit} + step on ${equipmentIds[0]} → ${next} (expected ${expected})`);
        }
      }
    }
    
    // Start from each grid value and step down
    for (let value = max; value >= 0; value -= step) {
      const next = nextWeight(value, -1, equipmentIds, unit);
      const multiple = Math.round(next / step);
      const expected = multiple * step;
      if (Math.abs(next - expected) > 1e-10 && next !== 0) {
        offGridCount++;
        if (offGridCount <= 3) {
          console.log(`    FAIL: ${value} ${unit} - step on ${equipmentIds[0]} → ${next} (expected ${expected})`);
        }
      }
    }
  }
  
  check('nextWeight from grid values stays on-grid', offGridCount === 0, 
    offGridCount > 0 ? `${offGridCount} off-grid results` : '');
}

console.log('\n15. nextWeight from any grid value stays on-bell (kettlebells)');
{
  let offBellCount = 0;
  const kgBells = KETTLEBELL_WEIGHTS_KG;
  const lbBells = KETTLEBELL_WEIGHTS_LB;
  
  // Test kg: step up and down from each bell
  for (const bell of kgBells) {
    const up = nextWeight(bell, 1, ['kettlebell'], 'kg');
    const down = nextWeight(bell, -1, ['kettlebell'], 'kg');
    
    if (!kgBells.includes(up)) {
      offBellCount++;
      if (offBellCount <= 3) {
        console.log(`    FAIL: ${bell} kg kettlebell + step → ${up} (not a standard bell)`);
      }
    }
    
    if (!kgBells.includes(down)) {
      offBellCount++;
      if (offBellCount <= 3) {
        console.log(`    FAIL: ${bell} kg kettlebell - step → ${down} (not a standard bell)`);
      }
    }
  }
  
  // Test lb: step up and down from each bell
  for (const bell of lbBells) {
    const up = nextWeight(bell, 1, ['kettlebell'], 'lb');
    const down = nextWeight(bell, -1, ['kettlebell'], 'lb');
    
    if (!lbBells.includes(up)) {
      offBellCount++;
      if (offBellCount <= 3) {
        console.log(`    FAIL: ${bell} lb kettlebell + step → ${up} (not a standard bell)`);
      }
    }
    
    if (!lbBells.includes(down)) {
      offBellCount++;
      if (offBellCount <= 3) {
        console.log(`    FAIL: ${bell} lb kettlebell - step → ${down} (not a standard bell)`);
      }
    }
  }
  
  check('nextWeight from kettlebell bells stays on-bell', offBellCount === 0, 
    offBellCount > 0 ? `${offBellCount} off-bell results` : '');
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
