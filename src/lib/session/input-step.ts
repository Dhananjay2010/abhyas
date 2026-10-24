/**
 * Stepper logic for weight and reps inputs.
 * Pure, deterministic functions with no React dependencies.
 */

export type WeightUnit = 'kg' | 'lb';

/**
 * Standard kettlebell weights in kg.
 * These follow the international competition standard progression.
 */
const KETTLEBELL_WEIGHTS_KG = [4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32];

/**
 * Standard kettlebell weights in lb.
 * Based on conventional US retail offerings: 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80 lb.
 * Source: Common US gym and retail standards (Rogue, Kettlebell Kings, etc.)
 */
const KETTLEBELL_WEIGHTS_LB = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80];

/**
 * Returns the weight step increment for given equipment.
 * 
 * Equipment-specific steps:
 * - barbell: 2.5 kg / 5 lb (smallest standard plate)
 * - dumbbell: 2 kg / 5 lb (typical increments)
 * - kettlebell: uses nextWeight ladder, not a fixed step
 * - machine/cable: 5 kg / 10 lb (stack increments)
 * - bodyweight added load: 2.5 kg / 5 lb (dip belt / weighted vest)
 * 
 * Multi-equipment exercises: uses the largest increment (most conservative choice).
 * Unknown equipment: defaults to 2.5 kg / 5 lb (same as barbell).
 * 
 * @param equipmentIds - Array of equipment IDs from the catalogue
 * @param unit - Weight unit ('kg' or 'lb')
 * @returns The step increment in the given unit
 */
export function stepFor(equipmentIds: string[], unit: WeightUnit): number {
  const machineIds = [
    'leg_press', 'hack_squat', 'leg_curl', 'leg_extension',
    'chest_press_machine', 'pec_deck', 'lat_pulldown',
    'seated_row_machine', 'shoulder_press_machine', 'smith_machine'
  ];

  const steps: number[] = [];

  for (const id of equipmentIds) {
    if (machineIds.includes(id) || id === 'cable_machine') {
      steps.push(unit === 'kg' ? 5 : 10);
    } else if (id === 'barbell' || id === 'ez_bar' || id === 'trap_bar') {
      steps.push(unit === 'kg' ? 2.5 : 5);
    } else if (id === 'dumbbell') {
      steps.push(unit === 'kg' ? 2 : 5);
    }
  }

  // If we found any equipment-specific steps, return the largest
  if (steps.length > 0) {
    return Math.max(...steps);
  }

  // Default: same as barbell (most common fallback)
  return unit === 'kg' ? 2.5 : 5;
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
    
    if (direction === 1) {
      // Find the next bell heavier than current
      const next = bells.find(w => w > current);
      return next !== undefined ? next : bells[bells.length - 1];
    } else {
      // Find the previous bell lighter than current
      const prev = bells.reverse().find(w => w < current);
      bells.reverse(); // restore original order
      return prev !== undefined ? prev : bells[0];
    }
  }

  // Standard equipment: step-based
  const step = stepFor(equipmentIds, unit);
  const result = current + (direction * step);
  
  // Snap to grid and clamp at 0
  const snapped = Math.round(result / step) * step;
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
