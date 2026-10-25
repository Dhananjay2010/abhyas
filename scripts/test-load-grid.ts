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

import { roundToEquipmentGrid, gridStepFor, KETTLEBELL_WEIGHTS_KG, KETTLEBELL_WEIGHTS_LB } from '../src/lib/session/equipment-grid';
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
  
  check('medicine_ball kg is 1', gridStepFor(['medicine_ball'], 'kg') === 1);
  check('medicine_ball lb is 2', gridStepFor(['medicine_ball'], 'lb') === 2);
  
  check('weight_plate kg is 2.5', gridStepFor(['weight_plate'], 'kg') === 2.5);
  check('weight_plate lb is 5', gridStepFor(['weight_plate'], 'lb') === 5);
  
  check('dip_belt kg is 2.5', gridStepFor(['dip_belt'], 'kg') === 2.5);
  check('dip_belt lb is 5', gridStepFor(['dip_belt'], 'lb') === 5);
  
  check('leg_curl kg is 5 (pin-stack)', gridStepFor(['leg_curl'], 'kg') === 5);
  check('leg_curl lb is 10 (pin-stack)', gridStepFor(['leg_curl'], 'lb') === 10);
  
  check('machine_generic kg is 5 (pin-stack)', gridStepFor(['machine_generic'], 'kg') === 5);
  check('machine_generic lb is 10 (pin-stack)', gridStepFor(['machine_generic'], 'lb') === 10);
  
  check('leg_press kg is 2.5 (plate-loaded)', gridStepFor(['leg_press'], 'kg') === 2.5);
  check('smith_machine kg is 2.5 (plate-loaded)', gridStepFor(['smith_machine'], 'kg') === 2.5);
  check('hack_squat kg is 2.5 (plate-loaded)', gridStepFor(['hack_squat'], 'kg') === 2.5);
  check('hack_squat lb is 5 (plate-loaded)', gridStepFor(['hack_squat'], 'lb') === 5);
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
  check('leg_press 100 lb on-grid', roundToEquipmentGrid(100, ['leg_press'], 'lb') === 100);
  check('leg_press 102 lb → 100 lb', roundToEquipmentGrid(102, ['leg_press'], 'lb') === 100);
  check('leg_press 104 lb → 105 lb (5 lb grid, not 10)', roundToEquipmentGrid(104, ['leg_press'], 'lb') === 105);
  check('leg_press 107 lb → 105 lb', roundToEquipmentGrid(107, ['leg_press'], 'lb') === 105);
  
  check('hack_squat 75 kg on-grid', roundToEquipmentGrid(75, ['hack_squat'], 'kg') === 75);
  check('hack_squat 76 kg → 75 kg', roundToEquipmentGrid(76, ['hack_squat'], 'kg') === 75);
  check('hack_squat 77 kg → 77.5 kg', roundToEquipmentGrid(77, ['hack_squat'], 'kg') === 77.5);
  check('hack_squat 150 lb on-grid', roundToEquipmentGrid(150, ['hack_squat'], 'lb') === 150);
  check('hack_squat 152 lb → 150 lb', roundToEquipmentGrid(152, ['hack_squat'], 'lb') === 150);
  check('hack_squat 154 lb → 155 lb (5 lb grid, not 10)', roundToEquipmentGrid(154, ['hack_squat'], 'lb') === 155);
}

console.log('\n6b. roundToEquipmentGrid - medicine_ball (1 kg / 2 lb minimum)');
{
  check('medicine_ball 1 kg on-grid (minimum)', roundToEquipmentGrid(1, ['medicine_ball'], 'kg') === 1);
  check('medicine_ball 2 kg on-grid', roundToEquipmentGrid(2, ['medicine_ball'], 'kg') === 2);
  check('medicine_ball 3 kg on-grid', roundToEquipmentGrid(3, ['medicine_ball'], 'kg') === 3);
  
  check('medicine_ball 0.5 kg → 1 kg (below min)', roundToEquipmentGrid(0.5, ['medicine_ball'], 'kg') === 1);
  check('medicine_ball 1.4 kg → 1 kg', roundToEquipmentGrid(1.4, ['medicine_ball'], 'kg') === 1);
  check('medicine_ball 1.6 kg → 2 kg', roundToEquipmentGrid(1.6, ['medicine_ball'], 'kg') === 2);
  check('medicine_ball 2.5 kg tie → 2 kg (down)', roundToEquipmentGrid(2.5, ['medicine_ball'], 'kg') === 2);
  
  check('medicine_ball 2 lb on-grid', roundToEquipmentGrid(2, ['medicine_ball'], 'lb') === 2);
  check('medicine_ball 4 lb on-grid', roundToEquipmentGrid(4, ['medicine_ball'], 'lb') === 4);
  check('medicine_ball 1 lb → 2 lb (below min)', roundToEquipmentGrid(1, ['medicine_ball'], 'lb') === 2);
  check('medicine_ball 3 lb tie → 2 lb (down)', roundToEquipmentGrid(3, ['medicine_ball'], 'lb') === 2);
  check('medicine_ball 3.1 lb → 4 lb', roundToEquipmentGrid(3.1, ['medicine_ball'], 'lb') === 4);
}

console.log('\n6c. roundToEquipmentGrid - weight_plate and dip_belt (2.5 kg / 5 lb)');
{
  check('weight_plate 20 kg on-grid', roundToEquipmentGrid(20, ['weight_plate'], 'kg') === 20);
  check('weight_plate 22.5 kg on-grid', roundToEquipmentGrid(22.5, ['weight_plate'], 'kg') === 22.5);
  check('weight_plate 21 kg → 20 kg', roundToEquipmentGrid(21, ['weight_plate'], 'kg') === 20);
  check('weight_plate 21.25 kg tie → 20 kg', roundToEquipmentGrid(21.25, ['weight_plate'], 'kg') === 20);
  
  check('dip_belt 10 lb on-grid', roundToEquipmentGrid(10, ['dip_belt'], 'lb') === 10);
  check('dip_belt 15 lb on-grid', roundToEquipmentGrid(15, ['dip_belt'], 'lb') === 15);
  check('dip_belt 12 lb → 10 lb', roundToEquipmentGrid(12, ['dip_belt'], 'lb') === 10);
  check('dip_belt 12.5 lb tie → 10 lb', roundToEquipmentGrid(12.5, ['dip_belt'], 'lb') === 10);
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
  
  // Epsilon test for kettlebell ties
  check('22 + 1e-12 kg tie (within epsilon) → 20 kg', roundToEquipmentGrid(22 + 1e-12, ['kettlebell'], 'kg') === 20);
  check('22 + 1e-8 kg (above epsilon) → 24 kg', roundToEquipmentGrid(22 + 1e-8, ['kettlebell'], 'kg') === 24);
  
  // Clamp to bounds
  check('below min (2 kg) → 4 kg', roundToEquipmentGrid(2, ['kettlebell'], 'kg') === 4);
  check('above max (50 kg) → 48 kg', roundToEquipmentGrid(50, ['kettlebell'], 'kg') === 48);
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
  check('zero → 0', roundToEquipmentGrid(0, ['barbell'], 'kg') === 0);
  
  // Kettlebell non-finite or non-positive: returns 0 (not min bell)
  check('kettlebell NaN → 0', roundToEquipmentGrid(NaN, ['kettlebell'], 'kg') === 0);
  check('kettlebell negative → 0', roundToEquipmentGrid(-5, ['kettlebell'], 'lb') === 0);
  check('kettlebell zero → 0', roundToEquipmentGrid(0, ['kettlebell'], 'kg') === 0);
  check('kettlebell -Infinity → 0', roundToEquipmentGrid(-Infinity, ['kettlebell'], 'kg') === 0);
}

console.log('\n9a. roundToEquipmentGrid - non-loadable equipment returns 0');
{
  check('empty array returns 0 (kg)', roundToEquipmentGrid(100, [], 'kg') === 0);
  check('empty array returns 0 (lb)', roundToEquipmentGrid(100, [], 'lb') === 0);
  
  check('bodyweight only returns 0 (kg)', roundToEquipmentGrid(100, ['bodyweight'], 'kg') === 0);
  check('bodyweight only returns 0 (lb)', roundToEquipmentGrid(100, ['bodyweight'], 'lb') === 0);
  
  check('pull_up_bar only returns 0 (kg)', roundToEquipmentGrid(50, ['pull_up_bar'], 'kg') === 0);
  check('dip_bars only returns 0 (lb)', roundToEquipmentGrid(50, ['dip_bars'], 'lb') === 0);
  check('yoga_mat only returns 0 (kg)', roundToEquipmentGrid(25, ['yoga_mat'], 'kg') === 0);
  
  check('resistance_band returns 0', roundToEquipmentGrid(50, ['resistance_band'], 'kg') === 0);
  check('flat_bench returns 0', roundToEquipmentGrid(100, ['flat_bench'], 'lb') === 0);
  check('adjustable_bench returns 0', roundToEquipmentGrid(100, ['adjustable_bench'], 'kg') === 0);
  check('stability_ball returns 0', roundToEquipmentGrid(75, ['stability_ball'], 'kg') === 0);
  check('trx returns 0', roundToEquipmentGrid(50, ['trx'], 'lb') === 0);
  check('jump_rope returns 0', roundToEquipmentGrid(10, ['jump_rope'], 'kg') === 0);
  
  // Mixed: non-loadable + loadable uses the loadable equipment's grid
  check('flat_bench + dumbbell uses dumbbell grid', roundToEquipmentGrid(21, ['flat_bench', 'dumbbell'], 'kg') === 20);
  check('resistance_band + barbell uses barbell grid', roundToEquipmentGrid(52, ['resistance_band', 'barbell'], 'kg') === 52.5);
  check('bodyweight + cable uses cable grid', roundToEquipmentGrid(11.25, ['bodyweight', 'cable_machine'], 'kg') === 10);
}

console.log('\n10. roundToEquipmentGrid - float precision (epsilon-safe)');
{
  // Test that only true ties round down, not near-ties
  check('11.2549 kg → 12.5 kg (above midpoint)', roundToEquipmentGrid(11.2549, ['dumbbell'], 'kg') === 12.5);
  check('11.25 kg tie → 10 kg (down)', roundToEquipmentGrid(11.25, ['dumbbell'], 'kg') === 10);
  check('11.25 + 1e-12 kg tie → 10 kg (within epsilon)', roundToEquipmentGrid(11.25 + 1e-12, ['dumbbell'], 'kg') === 10);
  check('0.1 + 0.2 + 11.0 = 11.3 → 12.5 kg', roundToEquipmentGrid(0.1 + 0.2 + 11.0, ['dumbbell'], 'kg') === 12.5);
  
  // 0.1 + 0.2 is very small, rounds to 0
  check('0.1 + 0.2 → 0', roundToEquipmentGrid(0.1 + 0.2, ['barbell'], 'kg') === 0);
  
  // 10 × 0.1 is also very small, rounds to 0
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += 0.1;
  }
  check('10 × 0.1 → 0', roundToEquipmentGrid(sum, ['barbell'], 'kg') === 0);
  
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
  
  // Mixed: bodyweight + loadable uses loadable grid
  check('bodyweight + dumbbell uses dumbbell grid', roundToEquipmentGrid(21, ['bodyweight', 'dumbbell'], 'kg') === 20);
  check('dip_bars + machine_generic uses machine grid', roundToEquipmentGrid(52, ['dip_bars', 'machine_generic'], 'kg') === 50);
  check('kettlebell + dumbbell: kettlebell takes precedence', roundToEquipmentGrid(7, ['kettlebell', 'dumbbell'], 'kg') === 6);
  
  // Non-loadable + loadable: loadable takes precedence
  check('dip_bars + dip_belt uses dip_belt grid (2.5 kg)', roundToEquipmentGrid(21, ['dip_bars', 'dip_belt'], 'kg') === 20);
  check('medicine_ball + dumbbell uses max step (2.5 kg > 1 kg)', roundToEquipmentGrid(21, ['medicine_ball', 'dumbbell'], 'kg') === 20);
}

console.log('\n12. Sweep test: all outputs 0..200 in 0.25 steps are EXACTLY on-grid');
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
      // Exact check: every multiple of 1, 2, 2.5, 5, 10 up to 200 is exact in floating point
      const isExact = rounded === Math.round(rounded / step) * step;
      
      if (!isExact) {
        offGridCount++;
        if (offGridCount <= 3) {
          console.log(`    FAIL: ${i} ${unit} on ${equipmentIds[0]} → ${rounded} (not exact multiple of ${step})`);
        }
      }
    }
  }
  check(`sweep 0..200 in 0.25 steps EXACTLY on-grid (${testCases.length} equipment types)`, offGridCount === 0, 
    offGridCount > 0 ? `${offGridCount} off-grid results` : '');
  
  // Add test that 20+1e-11 is NOT accepted or snapped to exactly 20
  const nearTwenty = 20 + 1e-11;
  const roundedNearTwenty = roundToEquipmentGrid(nearTwenty, ['barbell'], 'kg');
  check('20 + 1e-11 kg snaps to exactly 20', roundedNearTwenty === 20, `got ${roundedNearTwenty}`);
}

console.log('\n13. Sweep test: kettlebells snap to standard bells');
{
  let offBellCount = 0;
  const kgBells = KETTLEBELL_WEIGHTS_KG;
  const lbBells = KETTLEBELL_WEIGHTS_LB;
  
  // Test kg (skip 0 since non-positive input returns 0)
  for (let i = 0.25; i <= 200; i += 0.25) {
    const rounded = roundToEquipmentGrid(i, ['kettlebell'], 'kg');
    if (!kgBells.includes(rounded)) {
      offBellCount++;
      if (offBellCount <= 3) {
        console.log(`    FAIL: ${i} kg kettlebell → ${rounded} (not a standard bell)`);
      }
    }
  }
  
  // Test lb (skip 0)
  for (let i = 0.25; i <= 200; i += 0.25) {
    const rounded = roundToEquipmentGrid(i, ['kettlebell'], 'lb');
    if (!lbBells.includes(rounded)) {
      offBellCount++;
      if (offBellCount <= 3) {
        console.log(`    FAIL: ${i} lb kettlebell → ${rounded} (not a standard bell)`);
      }
    }
  }
  
  check('sweep 0.25..200 kettlebells snap to standard bells', offBellCount === 0, 
    offBellCount > 0 ? `${offBellCount} off-bell results` : '');
}

console.log('\n14. nextWeight from any grid value stays EXACTLY on-grid');
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
      // Exact check: every multiple of 1, 2, 2.5, 5, 10 up to 200 is exact in floating point
      const isExact = next === Math.round(next / step) * step;
      
      if (!isExact) {
        offGridCount++;
        if (offGridCount <= 3) {
          console.log(`    FAIL: ${value} ${unit} + step on ${equipmentIds[0]} → ${next} (not an exact multiple)`);
        }
      }
    }
    
    // Start from each grid value and step down
    for (let value = max; value >= 0; value -= step) {
      const next = nextWeight(value, -1, equipmentIds, unit);
      // Exact check: every multiple of 1, 2, 2.5, 5, 10 up to 200 is exact in floating point
      const isExact = next === Math.round(next / step) * step;
      
      if (!isExact) {
        offGridCount++;
        if (offGridCount <= 3) {
          console.log(`    FAIL: ${value} ${unit} - step on ${equipmentIds[0]} → ${next} (not an exact multiple)`);
        }
      }
    }
  }
  
  check('nextWeight from grid values stays EXACTLY on-grid', offGridCount === 0, 
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

console.log('\n16. stepFor and gridStepFor NEVER return 0 (stepper safety)');
{
  // All equipment IDs from seed migrations and codebase
  const allEquipmentIds = [
    // Loadable equipment
    'barbell', 'ez_bar', 'trap_bar',
    'dumbbell', 'kettlebell', 'medicine_ball',
    'cable_machine',
    'weight_plate', 'dip_belt',
    'leg_curl', 'leg_extension',
    'chest_press_machine', 'pec_deck', 'lat_pulldown',
    'seated_row_machine', 'shoulder_press_machine', 'machine_generic',
    'smith_machine', 'leg_press', 'hack_squat',
    // Non-loadable equipment
    'bodyweight', 'pull_up_bar', 'dip_bars',
    'yoga_mat',
    'flat_bench', 'adjustable_bench',
    'resistance_band',
    'squat_rack',
    'jump_rope',
    'stability_ball',
    'trx',
    'foam_roller',
    'ab_wheel',
    // Cardio equipment
    'treadmill',
    'stationary_bike',
    'rowing_machine',
    'elliptical',
  ];
  
  let zeroCount = 0;
  
  // Test each equipment ID individually in both kg and lb
  for (const id of allEquipmentIds) {
    const kgStep = gridStepFor([id], 'kg');
    const lbStep = gridStepFor([id], 'lb');
    
    if (kgStep <= 0) {
      zeroCount++;
      console.log(`    FAIL: gridStepFor(['${id}'], 'kg') returned ${kgStep}, expected > 0`);
    }
    
    if (lbStep <= 0) {
      zeroCount++;
      console.log(`    FAIL: gridStepFor(['${id}'], 'lb') returned ${lbStep}, expected > 0`);
    }
  }
  
  // Test empty list
  const emptyKg = gridStepFor([], 'kg');
  const emptyLb = gridStepFor([], 'lb');
  
  if (emptyKg <= 0) {
    zeroCount++;
    console.log(`    FAIL: gridStepFor([], 'kg') returned ${emptyKg}, expected > 0`);
  }
  
  if (emptyLb <= 0) {
    zeroCount++;
    console.log(`    FAIL: gridStepFor([], 'lb') returned ${emptyLb}, expected > 0`);
  }
  
  check(`all equipment IDs return positive step (${allEquipmentIds.length} ids × 2 units + empty list)`, zeroCount === 0,
    zeroCount > 0 ? `${zeroCount} returned zero or negative` : '');
  
  // Verify defaults for non-loadable equipment
  check('resistance_band kg returns default 2.5', gridStepFor(['resistance_band'], 'kg') === 2.5);
  check('flat_bench lb returns default 5', gridStepFor(['flat_bench'], 'lb') === 5);
  check('bodyweight kg returns default 2.5 (for added load)', gridStepFor(['bodyweight'], 'kg') === 2.5);
  check('treadmill kg returns default 2.5', gridStepFor(['treadmill'], 'kg') === 2.5);
  check('stationary_bike lb returns default 5', gridStepFor(['stationary_bike'], 'lb') === 5);
  check('rowing_machine kg returns default 2.5', gridStepFor(['rowing_machine'], 'kg') === 2.5);
  check('elliptical lb returns default 5', gridStepFor(['elliptical'], 'lb') === 5);
  check('empty list kg returns default 2.5', gridStepFor([], 'kg') === 2.5);
  check('empty list lb returns default 5', gridStepFor([], 'lb') === 5);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
