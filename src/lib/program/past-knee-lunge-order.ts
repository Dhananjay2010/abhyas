/**
 * Past-knee lunge preference order for BOTH plan generation AND swap ranking.
 * 
 * This tiered system determines which lunge-pattern exercises past-knee users get:
 * 1. dumbbell-rear-lunge (tier 1, highest priority)
 * 2. Other reverse/rear lunge variants (tier 2)
 * 3. Split squats with available equipment (tier 3)
 * 4. Step-ups LAST (tier 4, including step-up-with-knee-raise)
 * 
 * Tier 1 only (dumbbell-rear-lunge) relaxes:
 * - Level gate (beginners get it)
 * 
 * All tiers must pass: other injuries (hip/ankle/lower_back/wrist), BMI>=30 high-impact,
 * equipment, tracks, and #73's knee policies (jumps/plyo/unsafe lunges).
 */
import type { CandidateExercise } from "./generate";

/**
 * Get the past-knee lunge tier for an exercise.
 * Returns 1 (highest) to 4 (lowest), or 0 if not a past-knee lunge option.
 * 
 * Tier 1: dumbbell-rear-lunge ONLY
 * Tier 2: Other reverse/rear lunge variants (currently none in catalogue)
 * Tier 3: Split squats
 * Tier 4: Step-ups (LAST resort)
 */
export function pastKneeLungeTier(ex: CandidateExercise): number {
  // Tier 1: dumbbell-rear-lunge (highest priority, gets level relaxation)
  if (ex.slug === "dumbbell-rear-lunge") return 1;
  
  // Tier 2: Other reverse/rear lunge variants (none currently in catalogue)
  // Future: barbell-rear-lunge, etc.
  
  // Tier 3: Split squats
  const splitSquatSlugs = ["split-squat-with-dumbbells", "smith-single-leg-split-squat"];
  if (splitSquatSlugs.includes(ex.slug)) return 3;
  
  // Tier 4: Step-ups (LAST resort, including step-up-with-knee-raise)
  const stepUpSlugs = ["barbell-step-ups", "dumbbell-step-ups", "step-up-with-knee-raise"];
  if (stepUpSlugs.includes(ex.slug)) return 4;
  
  return 0; // Not a past-knee lunge option
}

/**
 * Check if a past-knee tier-1 exercise should be exempt from level gating.
 * Used by both isEligible and rankAlternatives to ensure beginners can access
 * dumbbell-rear-lunge when they have a past knee injury (not current).
 * 
 * @param ex - The exercise to check
 * @param anyKneeInjury - True if user has current OR past knee injury
 * @param hasCurrentKnee - True if user has CURRENT knee injury
 */
export function isPastKneeTier1LevelExempt(
  ex: CandidateExercise,
  anyKneeInjury: boolean,
  hasCurrentKnee: boolean
): boolean {
  const hasPastKnee = anyKneeInjury && !hasCurrentKnee;
  return hasPastKnee && pastKneeLungeTier(ex) === 1;
}
