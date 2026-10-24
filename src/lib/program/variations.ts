/**
 * Bodyweight progression chains for exercises.
 * 
 * Defines variation progressions from easier to harder variations of the same
 * movement pattern using bodyweight-only equipment.
 */

/**
 * Bodyweight progression chains, ordered from easiest to hardest.
 * Each chain represents a single movement with progressively harder variations.
 * All slugs reference exercises that exist in the seed catalogue.
 */
export const BODYWEIGHT_CHAINS: Record<string, string[]> = {
  // Push-up progressions
  "push-up": [
    "incline-push-up",
    "pushups",
    "push-ups-with-feet-elevated",
    "single-arm-push-up"
  ],
  
  // Squat progressions
  "squat": [
    "chair-squat",
    "box-squat",
    "bodyweight-squat"
  ],
  
  // Plank progressions
  "plank": [
    "plank",
    "push-up-to-side-plank"
  ],
  
  // Pull-up/chin-up progressions
  "pull-up": [
    "chin-up",
    "pullups",
    "wide-grip-rear-pull-up"
  ],
  
  // Dip progressions
  "dip": [
    "bench-dips",
    "dips-triceps-version"
  ],
  
  // Lunge progressions
  "lunge": [
    "dumbbell-lunges",
    "barbell-lunge",
    "barbell-walking-lunge"
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
