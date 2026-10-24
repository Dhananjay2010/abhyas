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
    "pushups",
    "push-ups-with-feet-elevated",
    "single-arm-push-up"
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
 * @param chain - The name of the progression chain (e.g., "push-up", "bridge")
 * @param currentSlug - The current exercise slug
 * @returns The next harder variation's slug, or null if at the end or slug not found
 */
export function nextVariation(chain: string, currentSlug: string): string | null {
  const variations: readonly string[] | undefined = BODYWEIGHT_CHAINS[chain];
  
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

/**
 * Validate that all exercises in the provided chains are bodyweight-only.
 * 
 * @param chains - The chains to validate
 * @param catalogue - Array of exercises with slug and equipment_ids
 * @returns Array of slugs that require equipment
 */
export function findNonBodyweightSlugs(
  chains: Readonly<Record<string, readonly string[]>>,
  catalogue: ReadonlyArray<{ slug: string; equipment_ids?: readonly string[] }>
): string[] {
  const nonBodyweight: string[] = [];
  
  for (const chain of Object.values(chains)) {
    for (const slug of chain) {
      const exercise = catalogue.find(ex => ex.slug === slug);
      if (exercise) {
        const equipmentIds: readonly string[] = exercise.equipment_ids || [];
        if (equipmentIds.length > 0) {
          nonBodyweight.push(slug);
        }
      }
    }
  }
  
  return nonBodyweight;
}
