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
  
  // Full-depth squats
  "barbell-full-squat",
  
  // Explosive loaded knee-flexion moves (jerks, speed/dynamic squats)
  "squat-jerk",
  "speed-box-squat",
  "speed-squats",
  
  // Kettlebell jerks (explosive overhead + deep catch)
  "double-kettlebell-jerk",
  "one-arm-kettlebell-jerk",
  "one-arm-kettlebell-split-jerk",
  "two-arm-kettlebell-jerk",
  "one-arm-kettlebell-clean-and-jerk",
  
  // Kettlebell explosive presses and thruster (leg-driven)
  "double-kettlebell-push-press",
  "one-arm-kettlebell-push-press",
  "kettlebell-thruster",
  
  // Band/chain accommodating resistance BARBELL squats (variable load through range)
  "squat-with-chains",
  "box-squat-with-bands",
  "box-squat-with-chains",
  "reverse-band-box-squat",
  "reverse-band-power-squat",
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
 * Check if a high-impact exercise involves lower body (legs).
 * High-impact leg moves are excluded for past-knee users.
 */
function isHighImpactLegExercise(ex: CandidateExercise): boolean {
  if (ex.impact !== "high") return false;
  
  // Lower-body movement patterns
  if (ex.movement_pattern === "squat" || ex.movement_pattern === "lunge") {
    return true;
  }
  
  // Lower-body muscles - check if ANY primary muscle is a leg muscle
  const legMuscles = ["quads", "glutes", "hamstrings", "adductors", "calves"];
  
  for (const muscle of ex.primary_muscles) {
    if (legMuscles.includes(muscle)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if an exercise should be excluded for past-knee users.
 * Excludes: explicit list + jumping exercises + high-impact leg exercises.
 */
export function isExcludedForPastKnee(ex: CandidateExercise): boolean {
  if (PAST_KNEE_EXCLUDED_SLUGS.has(ex.slug)) return true;
  if (isJumpingExercise(ex)) return true;
  if (isHighImpactLegExercise(ex)) return true;
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
    "goblet-squat",
    "box-squat",
    "leg-press",
    "split-squat-with-dumbbells",
    "wall-sit",
  ],
  lunge: [
    "dumbbell-rear-lunge",
    "barbell-step-ups",
    "dumbbell-step-ups",
    "step-up-with-knee-raise",
    "split-squat-with-dumbbells",
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
 * Wall-sit gets NO bonus in primary slots (not a primary), but gets bonus in swaps.
 * Returns a bonus score (add to existing score).
 */
export function kneeFriendlyBonus(ex: CandidateExercise, slotIndex: number): number {
  // Wall-sit: never a primary (heavy penalty in first 4 slots)
  if (ex.slug === "wall-sit" && slotIndex <= 3) {
    return -100; // Heavy penalty to prevent selection as primary
  }
  
  // Main slots (0-3) get preference for knee-friendly primaries
  if (slotIndex <= 3 && isKneeFriendlyPrimary(ex)) {
    return 10; // Strong bonus for knee-friendly primaries in main slots
  }
  
  return 0;
}

/**
 * Get knee-friendly ranking boost for past-knee users in swap ranking.
 * Lunge: dumbbell-rear-lunge = 2 (must be #1), others = 1
 * Squat: all knee-friendly = 1
 * Wall-sit: swap boost = 1 (top 5), but NOT a primary
 */
export function getKneeFriendlyRankingBoost(candidate: CandidateExercise): number {
  if (candidate.slug === "dumbbell-rear-lunge") return 2;
  
  const forSquat = KNEE_FRIENDLY_PRIMARIES.squat ?? [];
  const forLunge = KNEE_FRIENDLY_PRIMARIES.lunge ?? [];
  
  if (forSquat.includes(candidate.slug) || forLunge.includes(candidate.slug)) {
    return 1;
  }
  
  // Wall-sit: swap boost only, not a primary
  if (candidate.slug === "wall-sit") {
    return 1;
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
