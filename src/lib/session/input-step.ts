/**
 * Stepper logic for weight and reps inputs.
 * Pure, deterministic functions with no React dependencies.
 */

import { gridStepFor, KETTLEBELL_WEIGHTS_KG, KETTLEBELL_WEIGHTS_LB, type WeightUnit } from './equipment-grid';

export { KETTLEBELL_WEIGHTS_KG, KETTLEBELL_WEIGHTS_LB, kettlebellBounds, type WeightUnit } from './equipment-grid';

/**
 * Returns the weight step increment for given equipment.
 * 
 * Delegates to gridStepFor in equipment-grid.ts for consistent grid logic.
 * 
 * @param equipmentIds - Array of equipment IDs from the catalogue
 * @param unit - Weight unit ('kg' or 'lb')
 * @returns The step increment in the given unit
 */
export function stepFor(equipmentIds: string[], unit: 'kg' | 'lb'): number {
  return gridStepFor(equipmentIds, unit);
}

/**
 * Rounds a number to 2 decimal places to avoid float drift.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Returns the next weight in the given direction.
 * 
 * For kettlebells: jumps to the next or previous standard bell weight.
 * For other equipment: adds or subtracts the step, snaps to grid, clamps at 0.
 * 
 * @param current - Current weight value
 * @param direction - 1 for increase, -1 for decrease
 * @param equipmentIds - Array of equipment IDs
 * @param unit - Weight unit
 * @returns The next weight value, clamped and rounded
 */
export function nextWeight(
  current: number,
  direction: 1 | -1,
  equipmentIds: string[],
  unit: WeightUnit
): number {
  const isKettlebell = equipmentIds.includes('kettlebell');

  if (isKettlebell) {
    const bells = unit === 'kg' ? KETTLEBELL_WEIGHTS_KG : KETTLEBELL_WEIGHTS_LB;
    const minBell = bells[0];
    const maxBell = bells[bells.length - 1];
    
    if (direction === 1) {
      // Below min: go up to the first bell
      if (current < minBell) {
        return minBell;
      }
      // Find the next bell heavier than current
      const next = bells.find(w => w > current);
      return next !== undefined ? next : maxBell;
    } else {
      // At or below min: stay at current (component will disable -)
      if (current <= minBell) {
        return current;
      }
      // Find the previous bell lighter than current (no mutation)
      const prev = [...bells].reverse().find(w => w < current);
      return prev !== undefined ? prev : minBell;
    }
  }

  // Standard equipment: step-based
  const step = stepFor(equipmentIds, unit);
  
  // Check if current value is on-grid (within float tolerance)
  const currentOnGrid = Math.round(current / step) * step;
  const isOnGrid = Math.abs(current - currentOnGrid) < 0.001;
  
  if (isOnGrid) {
    // On-grid: move one step in the direction
    const result = current + (direction * step);
    return round2(Math.max(0, result));
  }
  
  // Off-grid: snap to the nearest grid point in the direction
  let snapped: number;
  if (direction === 1) {
    snapped = Math.ceil(current / step) * step;
  } else {
    snapped = Math.floor(current / step) * step;
  }
  
  return round2(Math.max(0, snapped));
}

/**
 * Standard reps step increment (always 1).
 */
export const REPS_STEP = 1;

/**
 * Returns the next reps value in the given direction.
 * 
 * @param current - Current reps value
 * @param direction - 1 for increase, -1 for decrease
 * @param options - Min and max bounds
 * @returns The next reps value, clamped to [min, max]
 */
export function nextReps(
  current: number,
  direction: 1 | -1,
  options: { min: number; max: number }
): number {
  const result = current + (direction * REPS_STEP);
  return Math.max(options.min, Math.min(options.max, result));
}
