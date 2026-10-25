import type { Database } from "@/lib/database.types";
import type { CandidateExercise } from "./generate";

type Pattern = Database["public"]["Enums"]["movement_pattern"];

/**
 * Past-knee tier: lighter restrictions than current knee injuries.
 * 
 * Owner decisions:
 * 1. EXCLUDE: pistol/single-leg-squat variants, jumping/plyometric, sissy squats,
 *    walking and jumping lunges
 * 2. PREFER: knee-friendly primaries (goblet squat, box squat, leg press, split squat
 *    with controlled range; dumbbell rear lunge or step-up over barbell lunge)
 * 3. Barbell back squat stays as swap option but NOT default primary
 * 4. Squat swap list must include leg press and goblet squat when equipment allows
 * 5. Deficit deadlift in swaps is fine
 */

/**
 * Exercises excluded for past-knee users (beyond current-knee contraindications).
 * These are problematic single-leg or explosive movements.
 * REAL prod slugs only, verified in test-past-knee.ts.
 */
const PAST_KNEE_EXCLUDED_SLUGS: ReadonlySet<string> = new Set([
  // Pistol squats (single-leg bodyweight squat variants)
  "smith-machine-pistol-squat",
  "kettlebell-pistol-squat",
  
  // Single-leg squats
  "one-leg-barbell-squat",
  
  // Walking and jumping lunges
  "barbell-walking-lunge",
  "lunge-sprint",
  
  // Sissy squats
  "weighted-sissy-squat",
]);

/**
 * Check if an exercise is plyometric/jumping (beyond explicit slugs).
 */
function isJumpingExercise(ex: CandidateExercise): boolean {
  const nameLower = ex.name.toLowerCase();
  const slugLower = ex.slug.toLowerCase();
  
  // High-impact exercises with jump/bound/plyo keywords
  if (ex.impact === "high" && (
    nameLower.includes("jump") || 
    nameLower.includes("bound") || 
    nameLower.includes("plyo") ||
    slugLower.includes("jump") ||
    slugLower.includes("bound") ||
    slugLower.includes("plyo")
  )) {
    return true;
  }
  
  return false;
}

/**
 * Check if an exercise should be excluded for past-knee users.
 */
export function isExcludedForPastKnee(ex: CandidateExercise): boolean {
  if (PAST_KNEE_EXCLUDED_SLUGS.has(ex.slug)) {
    return true;
  }
  
  return false;
}

/**
 * Knee-friendly primary exercises for past-knee users.
 * These use controlled ROM or limited depth that's easier on the knee.
 * Priority order: preferred first.
 * REAL prod slugs only, verified in test-past-knee.ts.
 */
const KNEE_FRIENDLY_PRIMARIES: Partial<Record<Pattern, string[]>> = {
  squat: [
    "goblet-squat",        // Controlled depth, easier loading pattern
    "box-squat",           // Limited depth to parallel
    "leg-press",           // Controlled ROM, less stress
    "split-squat-with-dumbbells", // Controlled range, less total flexion
  ],
  lunge: [
    "dumbbell-rear-lunge",         // Less anterior knee stress than forward lunge
    "barbell-step-ups",            // Controlled height, user picks box
    "dumbbell-step-ups",           // Controlled height
    "step-up-with-knee-raise",     // Controlled height
    "split-squat-with-dumbbells",  // Controlled range
  ],
};

/**
 * Check if an exercise is a knee-friendly primary option for past-knee users.
 */
function isKneeFriendlyPrimary(ex: CandidateExercise): boolean {
  const forSquat = KNEE_FRIENDLY_PRIMARIES.squat ?? [];
  const forLunge = KNEE_FRIENDLY_PRIMARIES.lunge ?? [];
  
  return forSquat.includes(ex.slug) || forLunge.includes(ex.slug);
}

/**
 * Rank knee-friendly exercises higher than others for past-knee users.
 * Returns a bonus score (add to existing score).
 */
export function kneeFriendlyBonus(ex: CandidateExercise, slotIndex: number): number {
  // Main slots (0-3) get preference for knee-friendly primaries
  if (slotIndex <= 3 && isKneeFriendlyPrimary(ex)) {
    return 10; // Strong bonus for knee-friendly primaries in main slots
  }
  
  return 0;
}

/**
 * Get excluded and friendly lists for testing.
 */
export function getPastKneeExcludedSlugs(): ReadonlySet<string> {
  return PAST_KNEE_EXCLUDED_SLUGS;
}

export function getKneeFriendlyPrimaries(pattern: Pattern): readonly string[] {
  return KNEE_FRIENDLY_PRIMARIES[pattern] ?? [];
}
