/**
 * Bodyweight progression chains for exercises.
 * 
 * Defines variation progressions from easier to harder variations of the same
 * movement pattern using bodyweight-only equipment (no equipment required).
 */

/**
 * Bodyweight progression chains, ordered from easiest to hardest.
 * Each chain represents a single movement with progressively harder variations.
 * All slugs reference exercises that exist in the seed catalogue and require no equipment.
 */
export const BODYWEIGHT_CHAINS: Readonly<Record<string, readonly string[]>> = {
  // Push-up progressions
  "push-up": [
    "incline-push-up",
    "pushups",
    "push-ups-with-feet-elevated",
    "single-arm-push-up"
  ] as const,
  
  // Squat progressions
  "squat": [
    "chair-squat",
    "box-squat",
    "bodyweight-squat"
  ] as const,
  
  // Plank progressions
  "plank": [
    "plank",
    "side-bridge"
  ] as const,
  
  // Pull-up/chin-up progressions (no wide-grip-rear-pull-up - behind-neck is contraindicated)
  "pull-up": [
    "chin-up",
    "pullups"
  ] as const,
  
  // Dip progressions
  "dip": [
    "bench-dips",
    "dips-triceps-version"
  ] as const,
  
  // Bridge progressions
  "bridge": [
    "butt-lift-bridge",
    "single-leg-glute-bridge"
  ] as const
} as const;

/**
 * Find the next harder variation in a progression chain.
 * 
 * @param chain - The name of the progression chain (e.g., "push-up", "squat")
 * @param currentSlug - The current exercise slug
 * @returns The next harder variation's slug, or null if at the end or slug not found
 */
export function nextVariation(chain: string, currentSlug: string): string | null {
  const variations = BODYWEIGHT_CHAINS[chain];
  
  if (!variations) {
    return null; // Unknown chain
  }
  
  const currentIndex = variations.indexOf(currentSlug);
  
  if (currentIndex === -1) {
    return null; // Current slug not in this chain
  }
  
  if (currentIndex === variations.length - 1) {
    return null; // Already at the hardest variation
  }
  
  return variations[currentIndex + 1];
}
