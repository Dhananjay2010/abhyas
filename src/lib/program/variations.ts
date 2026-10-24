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
 * 
 * Chains with fewer than 2 exercises have been removed.
 */
export const BODYWEIGHT_CHAINS: Record<string, string[]> = {
  // Push-up progressions (no incline-push-up - requires bench)
  "push-up": [
    "pushups",
    "push-ups-with-feet-elevated",
    "single-arm-push-up"
  ],
  
  // Plank progressions
  "plank": [
    "plank",
    "side-bridge"
  ],
  
  // Bridge progressions
  "bridge": [
    "butt-lift-bridge",
    "single-leg-glute-bridge"
  ]
};

/**
 * Find the next harder variation in a progression chain.
 * 
 * @param chain - The name of the progression chain (e.g., "push-up", "plank")
 * @param currentSlug - The current exercise slug
 * @returns The next harder variation's slug, or null if at the end or slug not found
 */
export function nextVariation(chain: string, currentSlug: string): string | null {
  const variations: string[] | undefined = BODYWEIGHT_CHAINS[chain];
  
  if (!variations) {
    return null;
  }
  
  const currentIndex: number = variations.indexOf(currentSlug);
  
  if (currentIndex === -1) {
    return null;
  }
  
  if (currentIndex === variations.length - 1) {
    return null;
  }
  
  return variations[currentIndex + 1];
}
