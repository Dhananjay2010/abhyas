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
  
  // Elevated/deficit lunges (knee-unsafe per #73: deficit adds knee flexion)
  "elevated-back-lunge",
  
  // Sissy squats
  "weighted-sissy-squat",
  
  // Full-depth squats
  "barbell-full-squat",
  
  // Item 15: Banned squats for past knee (deficit deadlift, hack squat, Smith squat, front squat)
  "deficit-deadlift",
  "barbell-hack-squat",
  "hack-squat",
  "narrow-stance-hack-squats",
  "smith-machine-squat",
  "front-barbell-squat",
  "front-barbell-squat-to-a-bench",
  "front-squat-clean-grip",
  "front-squats-with-two-kettlebells",
  
  // Explosive loaded knee-flexion moves (speed/dynamic squats)
  "speed-box-squat",
  "speed-squats",
  
  // Thrusters: banned for BOTH current AND past knee (item 14)
  "kettlebell-thruster",
  
  // Olympic lift jerks: banned for BOTH tiers (squat-jerk involves deep catch)
  "squat-jerk",
  
  // Band/chain accommodating resistance BARBELL squats (variable load through range)
  "squat-with-bands",
  "squat-with-chains",
  "box-squat-with-bands",
  "box-squat-with-chains",
  "reverse-band-box-squat",
  "reverse-band-power-squat",
  
  // Running/sprinting moves (loads knee, mislabeled muscles)
  "wind-sprints",
  "chest-push-with-run-release",
  
  // Jogging (repeated knee loading)
  "jogging-treadmill",
]);

/**
 * Check if an exercise is plyometric/jumping (beyond explicit slugs).
 */
/**
 * Coordinator decision (f): Identifies jumping exercises for past-knee exclusion.
 * Bans only exercises with lower-body take-off or landing: jumps, hops, bounds,
 * box and depth jumps, skater jumps, burpees, jump squats and lunges, and jump rope
 * where catalogued as plyometric. Upper-body plyos (17 total: plyo-push-up, clap push-ups,
 * standing medicine-ball slams and throws) stay allowed for BOTH knee tiers.
 * Rule based on movement and body part, not category alone.
 */
function isJumpingExercise(ex: CandidateExercise): boolean {
  const nameLower = ex.name.toLowerCase();
  const slugLower = ex.slug.toLowerCase();
  
  // Lower-body muscles that indicate a jumping/landing exercise
  const lowerBodyMuscles = new Set(["quads", "glutes", "hamstrings", "calves", "adductors"]);
  const hasLowerBodyPrimary = ex.primary_muscles.some(m => lowerBodyMuscles.has(m));
  
  // Jumping keywords indicating take-off or landing
  const jumpKeywords = ["jump", "bound", "hop", "plyo", "skip"];
  const hasJumpKeyword = jumpKeywords.some(kw => 
    nameLower.includes(kw) || slugLower.includes(kw));
  
  // Lower-body plyometrics with jumping movement (take-off/landing)
  if (hasLowerBodyPrimary && hasJumpKeyword) {
    return true;
  }
  
  // Additional patterns: burpees (full-body but with jump component)
  if (nameLower.includes("burpee") || slugLower.includes("burpee")) {
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
 * Item 15: goblet, box, bodyweight squat, leg press are allowed.
 * Barbell back squat is allowed but never leads (handled via separate penalty).
 * REAL prod slugs only, verified in test-past-knee.ts.
 */
const KNEE_FRIENDLY_PRIMARIES: Partial<Record<Pattern, string[]>> = {
  squat: [
    "goblet-squat",
    "box-squat",
    "bodyweight-squat",
    "leg-press",
    "split-squat-with-dumbbells",
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
 * Item 15: Barbell back squat gets penalty in early slots (shouldn't lead).
 * Returns a bonus score (add to existing score).
 */
export function kneeFriendlyBonus(ex: CandidateExercise, slotIndex: number, hasPastKnee: boolean): number {
  // Wall-sit: never a primary (heavy penalty in first 4 slots)
  if (ex.slug === "wall-sit" && slotIndex <= 3) {
    return -100; // Heavy penalty to prevent selection as primary
  }
  
  // Item 15 & QA Steer (o) & Step 6: Barbell back squat penalty for past knee in primary slots (shouldn't lead)
  // Covers all barbell squat variants: barbell-squat, wide-stance-barbell-squat, jefferson-squats, barbell-squat-to-a-bench, etc.
  const demotedSquatSlugs = new Set([
    "barbell-squat",
    "wide-stance-barbell-squat",
    "jefferson-squats",
    "barbell-squat-to-a-bench",
  ]);
  
  const isBarbellSquat = ex.movement_pattern === "squat" && 
    ex.equipment_ids.includes("barbell") && 
    ex.slug.includes("barbell") && 
    ex.slug.includes("squat") &&
    !ex.slug.includes("front"); // Front squats are different
  
  if (hasPastKnee && (isBarbellSquat || demotedSquatSlugs.has(ex.slug)) && slotIndex <= 1) {
    return -1000; // Heavy penalty to ensure goblet/box squat leads instead
  }
  
  // Item 15: Goblet/box squat bonus for past knee in leading squat slot
  if (hasPastKnee && slotIndex <= 1 && ex.movement_pattern === "squat" && 
      (ex.slug === "goblet-squat" || ex.slug === "box-squat")) {
    return 1000; // Heavy bonus to ensure these lead over barbell-squat
  }
  
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

/**
 * Item 14: Kettlebell jerks and push presses are banned for CURRENT knee only.
 * They are ALLOWED for past knee (not in PAST_KNEE_EXCLUDED_SLUGS).
 * Thrusters are banned for BOTH tiers (in PAST_KNEE_EXCLUDED_SLUGS).
 */
const CURRENT_KNEE_ONLY_EXCLUDED_SLUGS: ReadonlySet<string> = new Set([
  // Kettlebell jerks: explosive overhead + deep catch (current knee only)
  "double-kettlebell-jerk",
  "one-arm-kettlebell-jerk",
  "one-arm-kettlebell-split-jerk",
  "two-arm-kettlebell-jerk",
  "one-arm-kettlebell-clean-and-jerk",
  
  // Kettlebell push presses: leg-driven explosive press (current knee only)
  "double-kettlebell-push-press",
  "one-arm-kettlebell-push-press",
]);

/**
 * Check if an exercise should be excluded for CURRENT knee injuries only.
 * These are allowed for past knee.
 */
export function isExcludedForCurrentKneeOnly(ex: CandidateExercise): boolean {
  return CURRENT_KNEE_ONLY_EXCLUDED_SLUGS.has(ex.slug);
}

export function getCurrentKneeOnlyExcludedSlugs(): ReadonlySet<string> {
  return CURRENT_KNEE_ONLY_EXCLUDED_SLUGS;
}
