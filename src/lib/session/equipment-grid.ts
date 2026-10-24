/**
 * Equipment-specific weight grid logic.
 * Pure, deterministic functions for snapping weights to loadable values.
 */

export type WeightUnit = 'kg' | 'lb';

/**
 * Pin-stack/selectorised machine IDs: fixed weight stacks with selector pin.
 */
const PIN_STACK_MACHINE_IDS: readonly string[] = [
  'leg_curl', 'leg_extension',
  'chest_press_machine', 'pec_deck', 'lat_pulldown',
  'seated_row_machine', 'shoulder_press_machine', 'machine_generic',
];

/**
 * Plate-loaded machine IDs: use standard plates like barbells.
 */
const PLATE_LOADED_MACHINE_IDS: readonly string[] = [
  'smith_machine', 'leg_press', 'hack_squat',
];

/**
 * Equipment IDs that can carry external weight load.
 * Everything else (resistance bands, benches, mats, cardio equipment, etc.) is non-loadable.
 */
export const LOADABLE_EQUIPMENT_IDS: ReadonlySet<string> = new Set([
  // Barbells
  'barbell', 'ez_bar', 'trap_bar',
  // Dumbbells
  'dumbbell',
  // Kettlebells
  'kettlebell',
  // Medicine balls
  'medicine_ball',
  // Cables
  'cable_machine',
  // Weight plates (standalone loading)
  'weight_plate',
  // Dip belt (for added load)
  'dip_belt',
  // Pin-stack/selectorised machines
  ...PIN_STACK_MACHINE_IDS,
  // Plate-loaded machines
  ...PLATE_LOADED_MACHINE_IDS,
]);

/**
 * Standard kettlebell weights in kg.
 * These follow the international competition standard progression.
 * Frozen to prevent mutation of the shared constant.
 */
export const KETTLEBELL_WEIGHTS_KG: readonly number[] = Object.freeze([4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32]);

/**
 * Standard kettlebell weights in lb.
 * Based on conventional US retail offerings: 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80 lb.
 * Source: Common US gym and retail standards (Rogue, Kettlebell Kings, etc.)
 * Frozen to prevent mutation of the shared constant.
 */
export const KETTLEBELL_WEIGHTS_LB: readonly number[] = Object.freeze([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80]);

/**
 * Returns the kettlebell weight bounds for a given unit.
 * 
 * @param unit - Weight unit ('kg' or 'lb')
 * @returns Object with min and max kettlebell weights
 */
export function kettlebellBounds(unit: WeightUnit): { min: number; max: number } {
  const bells = unit === 'kg' ? KETTLEBELL_WEIGHTS_KG : KETTLEBELL_WEIGHTS_LB;
  return {
    min: bells[0],
    max: bells[bells.length - 1],
  };
}

/**
 * Returns the weight step increment for given equipment.
 * 
 * Equipment-specific steps:
 * - barbell: 2.5 kg / 5 lb (smallest standard plate)
 * - dumbbell: 2.5 kg / 5 lb (standard gym increments)
 * - cable: 2.5 kg / 5 lb (aligned with barbell)
 * - kettlebell: uses kettlebell ladder, not a fixed step
 * - medicine_ball: 1 kg / 2 lb (lightest medicine balls start at 1 kg / 2 lb)
 * - weight_plate: 2.5 kg / 5 lb (standard plate increments)
 * - dip_belt: 2.5 kg / 5 lb (added-load plate grid)
 * - pin-stack/selectorised machines: 5 kg / 10 lb (weight stack selector)
 * - plate-loaded machines: 2.5 kg / 5 lb (use plates like barbells)
 * - bodyweight added load: 2.5 kg / 5 lb (dip belt / weighted vest)
 * 
 * Pin-stack machines have a selector pin and fixed weight increments (typically 5 kg / 10 lb).
 * Plate-loaded machines (smith machine, leg press, hack squat) use standard plates (2.5 kg / 5 lb).
 * 
 * Multi-equipment exercises: uses the largest increment (most conservative choice).
 * Unknown equipment: defaults to 2.5 kg / 5 lb (same as barbell).
 * 
 * @param equipmentIds - Array of equipment IDs from the catalogue
 * @param unit - Weight unit ('kg' or 'lb')
 * @returns The step increment in the given unit
 */
export function gridStepFor(equipmentIds: string[], unit: WeightUnit): number {
  const steps: number[] = [];

  for (const id of equipmentIds) {
    if (PIN_STACK_MACHINE_IDS.includes(id)) {
      // Pin-stack machines: 5 kg / 10 lb (selector pin increments)
      steps.push(unit === 'kg' ? 5 : 10);
    } else if (PLATE_LOADED_MACHINE_IDS.includes(id)) {
      // Plate-loaded machines: 2.5 kg / 5 lb (use plates)
      steps.push(unit === 'kg' ? 2.5 : 5);
    } else if (id === 'medicine_ball') {
      // Medicine balls: 1 kg / 2 lb (lightest standard medicine ball)
      steps.push(unit === 'kg' ? 1 : 2);
    } else if (id === 'cable_machine') {
      // Cable machines: 2.5 kg / 5 lb
      steps.push(unit === 'kg' ? 2.5 : 5);
    } else if (id === 'barbell' || id === 'ez_bar' || id === 'trap_bar') {
      steps.push(unit === 'kg' ? 2.5 : 5);
    } else if (id === 'dumbbell') {
      steps.push(unit === 'kg' ? 2.5 : 5);
    } else if (id === 'weight_plate' || id === 'dip_belt') {
      // Weight plates and dip belt: 2.5 kg / 5 lb (plate increments)
      steps.push(unit === 'kg' ? 2.5 : 5);
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
 * Snaps a weight value to the equipment's loadable grid.
 * 
 * Rounding rules:
 * - Non-loadable equipment (resistance bands, benches, mats, etc.) returns 0
 * - Non-finite, non-positive, or zero inputs return 0
 * - Rounds to the nearest grid value
 * - Ties (e.g., 11.25 kg on 2.5 kg grid) round DOWN for safety
 * - Kettlebells snap to the nearest standard bell weight
 * 
 * The output is guaranteed to sit exactly on the equipment's grid using
 * epsilon-based comparison to avoid floating-point drift.
 * 
 * @param value - The weight value to round
 * @param equipmentIds - Array of equipment IDs
 * @param unit - Weight unit ('kg' or 'lb')
 * @returns The rounded weight value on the equipment grid, or 0 for non-loadable equipment
 */
export function roundToEquipmentGrid(
  value: number,
  equipmentIds: string[],
  unit: WeightUnit
): number {
  // Non-loadable equipment: no external weight
  const hasLoadable = equipmentIds.some(id => LOADABLE_EQUIPMENT_IDS.has(id));
  if (!hasLoadable) {
    return 0;
  }

  // Handle non-finite, non-positive, or zero values
  if (!isFinite(value) || value <= 0) {
    return 0;
  }

  // Kettlebell: snap to nearest standard bell weight
  if (equipmentIds.includes('kettlebell')) {
    const bells = unit === 'kg' ? KETTLEBELL_WEIGHTS_KG : KETTLEBELL_WEIGHTS_LB;
    const minBell = bells[0];
    const maxBell = bells[bells.length - 1];

    // Clamp to bounds
    if (value <= minBell) return minBell;
    if (value >= maxBell) return maxBell;

    // Find nearest bell (ties round down with epsilon)
    const epsilon = 1e-9;
    let closestBell = minBell;
    let minDistance = Math.abs(value - minBell);

    for (const bell of bells) {
      const distance = Math.abs(value - bell);
      // For ties (equal distance within epsilon), keep the lower bell (round down)
      if (distance < minDistance - epsilon) {
        minDistance = distance;
        closestBell = bell;
      }
    }

    return closestBell;
  }

  // Medicine ball: 1 kg / 2 lb minimum
  if (equipmentIds.includes('medicine_ball')) {
    const minimum = unit === 'kg' ? 1 : 2;
    if (value < minimum) {
      return minimum;
    }
  }

  // Standard equipment: grid-based rounding
  const step = gridStepFor(equipmentIds, unit);
  const halfStep = step / 2;
  const epsilon = 1e-9;

  // Find the two nearest grid points
  const lowerMultiple = Math.floor(value / step);
  const lowerValue = lowerMultiple * step;
  const upperValue = (lowerMultiple + 1) * step;

  // Calculate distance to midpoint
  const midpoint = lowerValue + halfStep;
  const distanceToMidpoint = value - midpoint;

  // Determine rounding direction
  let result: number;
  if (distanceToMidpoint < -epsilon) {
    // Below midpoint (not a tie): round down
    result = lowerValue;
  } else if (distanceToMidpoint > epsilon) {
    // Above midpoint (not a tie): round up
    result = upperValue;
  } else {
    // At midpoint or within epsilon (tie): round down for safety
    result = lowerValue;
  }

  // Ensure result is non-negative
  return Math.max(0, result);
}
