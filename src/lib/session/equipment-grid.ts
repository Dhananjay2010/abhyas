/**
 * Equipment-specific weight grid logic.
 * Pure, deterministic functions for snapping weights to loadable values.
 */

export type WeightUnit = 'kg' | 'lb';

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
 * - machine/pin-stack: 5 kg / 10 lb (pin-stack selector plates)
 * - bodyweight added load: 2.5 kg / 5 lb (dip belt / weighted vest)
 * 
 * Multi-equipment exercises: uses the largest increment (most conservative choice).
 * Unknown equipment: defaults to 2.5 kg / 5 lb (same as barbell).
 * 
 * @param equipmentIds - Array of equipment IDs from the catalogue
 * @param unit - Weight unit ('kg' or 'lb')
 * @returns The step increment in the given unit
 */
export function gridStepFor(equipmentIds: string[], unit: WeightUnit): number {
  const machineIds = [
    'leg_press', 'hack_squat', 'leg_curl', 'leg_extension',
    'chest_press_machine', 'pec_deck', 'lat_pulldown',
    'seated_row_machine', 'shoulder_press_machine', 'smith_machine'
  ];

  const steps: number[] = [];

  for (const id of equipmentIds) {
    if (machineIds.includes(id)) {
      // Pin-stack machines: 5 kg / 10 lb
      steps.push(unit === 'kg' ? 5 : 10);
    } else if (id === 'cable_machine') {
      // Cable machines: 2.5 kg / 5 lb
      steps.push(unit === 'kg' ? 2.5 : 5);
    } else if (id === 'barbell' || id === 'ez_bar' || id === 'trap_bar') {
      steps.push(unit === 'kg' ? 2.5 : 5);
    } else if (id === 'dumbbell') {
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
 * - Rounds to the nearest grid value
 * - Ties (e.g., 11.25 kg on 2.5 kg grid) round DOWN for safety
 * - Non-finite or negative inputs return the minimum loadable value
 * - Bodyweight-only equipment returns 0
 * - Kettlebells snap to the nearest standard bell weight
 * 
 * The output is guaranteed to sit exactly on the equipment's grid using
 * integer arithmetic to avoid floating-point drift.
 * 
 * @param value - The weight value to round
 * @param equipmentIds - Array of equipment IDs
 * @param unit - Weight unit ('kg' or 'lb')
 * @returns The rounded weight value on the equipment grid
 */
export function roundToEquipmentGrid(
  value: number,
  equipmentIds: string[],
  unit: WeightUnit
): number {
  // Handle non-finite or negative values
  if (!isFinite(value) || value < 0) {
    // For kettlebells, return the minimum bell
    if (equipmentIds.includes('kettlebell')) {
      return kettlebellBounds(unit).min;
    }
    // For other equipment, return 0
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

    // Find nearest bell (ties round down)
    let closestBell = minBell;
    let minDistance = Math.abs(value - minBell);

    for (const bell of bells) {
      const distance = Math.abs(value - bell);
      // Strict less-than means ties keep the lower bell (round down)
      if (distance < minDistance) {
        minDistance = distance;
        closestBell = bell;
      }
    }

    return closestBell;
  }

  // Standard equipment: grid-based rounding
  const step = gridStepFor(equipmentIds, unit);

  // Use integer arithmetic to avoid float drift
  // Multiply by 100 to handle 0.5 precision, then work in cents
  const stepCents = Math.round(step * 100);
  const valueCents = Math.round(value * 100);

  // Compute how many steps fit into the value
  // Round to nearest, but ties go DOWN (safer load)
  const remainder = valueCents % stepCents;
  const halfStep = stepCents / 2;
  
  let steps: number;
  if (remainder < halfStep) {
    // Below halfway: round down
    steps = Math.floor(valueCents / stepCents);
  } else if (remainder > halfStep) {
    // Above halfway: round up
    steps = Math.ceil(valueCents / stepCents);
  } else {
    // Exactly halfway: round down (ties go down)
    steps = Math.floor(valueCents / stepCents);
  }
  
  // Ensure result is non-negative
  const resultCents = Math.max(0, steps * stepCents);
  
  return resultCents / 100;
}
