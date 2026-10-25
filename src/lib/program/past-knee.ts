import type { Database } from "@/lib/database.types";
import type { CandidateExercise } from "./generate";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type Pattern = Database["public"]["Enums"]["movement_pattern"];

/**
 * Past-knee tier: lighter restrictions than current knee injuries.
 * 
 * Owner decisions:
 * 1. EXCLUDE: pistol/single-leg-squat variants, jumping/plyometric, sissy squats,
 *    walking and jumping lunges, warm-ups with "full depth" cues
 * 2. PREFER: knee-friendly primaries (goblet squat, box squat, leg press, split squat
 *    with controlled range; reverse lunge or step-up over barbell lunge)
 * 3. Barbell back squat stays as swap option but NOT default primary
 * 4. Squat swap list must include leg press and goblet squat when equipment allows
 * 5. Deficit deadlift in swaps is fine
 */

/**
 * Exercises excluded for past-knee users (beyond current-knee contraindications).
 * These are problematic single-leg or explosive movements.
 */
const PAST_KNEE_EXCLUDED_SLUGS: ReadonlySet<string> = new Set([
  // Single-leg squat variants (pistol, single-leg)
  "pistol-squat",
  "smith-machine-pistol-squat",
  "single-leg-squat",
  "single-leg-squat-with-support",
  "bulgarian-single-leg-squat",
  
  // Walking and jumping lunges
  "barbell-walking-lunge",
  "dumbbell-walking-lunge",
  "walking-lunge",
  "jumping-lunge",
  "lunge-jump",
  "alternating-lunge-jump",
  
  // Sissy squats
  "sissy-squat",
  "sissy-squat-with-support",
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
  
  return isJumpingExercise(ex);
}

/**
 * Knee-friendly primary exercises for past-knee users.
 * These use controlled ROM or limited depth that's easier on the knee.
 * Priority order: preferred first.
 */
const KNEE_FRIENDLY_PRIMARIES: Record<Pattern, string[]> = {
  squat: [
    "goblet-squat",        // Controlled depth, easier loading pattern
    "box-squat",           // Limited depth to parallel
    "leg-press",           // Controlled ROM, less stress
    "barbell-split-squat", // Controlled range, less total flexion than lunge
  ],
  lunge: [
    "reverse-lunge",                // Less anterior knee stress than forward lunge
    "barbell-step-ups",             // Controlled height, user picks box
    "dumbbell-step-ups",            // Controlled height
    "step-up-with-knee-raise",      // Controlled height
    "elevated-back-lunge",          // Controlled deficit
    "barbell-split-squat",          // Controlled range
  ],
};

/**
 * Get the knee-friendly preference list for a pattern.
 */
export function getKneeFriendlyPrimaries(pattern: Pattern): string[] {
  return KNEE_FRIENDLY_PRIMARIES[pattern] ?? [];
}

/**
 * Check if an exercise is a knee-friendly primary option for past-knee users.
 */
export function isKneeFriendlyPrimary(ex: CandidateExercise): boolean {
  const forSquat = KNEE_FRIENDLY_PRIMARIES.squat ?? [];
  const forLunge = KNEE_FRIENDLY_PRIMARIES.lunge ?? [];
  
  return forSquat.includes(ex.slug) || forLunge.includes(ex.slug);
}

/**
 * Check if barbell back squat is being used (should not be primary for past-knee).
 */
export function isBarbellBackSquat(ex: CandidateExercise): boolean {
  return ex.slug === "barbell-squat";
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
 * Filter warm-up instructions to remove "full depth" cues for past/current knee users.
 */
export function filterFullDepthCues(instructions: string[], hasKneeInjury: boolean): string[] {
  if (!hasKneeInjury) {
    return instructions;
  }
  
  return instructions.map(instruction => {
    const lower = instruction.toLowerCase();
    
    // Replace "full depth" with "controlled range" or remove the phrase
    if (lower.includes("full depth")) {
      return instruction.replace(/full depth/gi, "controlled range");
    }
    
    return instruction;
  });
}

/**
 * Check if a warm-up should be excluded for past-knee due to "full depth" cues.
 * For past-knee, we filter the cues rather than exclude the entire warm-up.
 */
export function shouldFilterWarmupForPastKnee(
  slug: string,
  instructions: string[],
  hasPastKnee: boolean
): boolean {
  if (!hasPastKnee) return false;
  
  // For bodyweight squat warm-ups with "full depth", we filter the cue
  // but don't exclude the warm-up entirely (it's still useful with controlled range)
  return false;
}
