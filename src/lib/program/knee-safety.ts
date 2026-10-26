/**
 * Knee safety predicates for program generation.
 * 
 * Exported for use in generate.ts and tests, and available for future swap PR imports.
 */

import type { CandidateExercise } from "./generate";
import type { Database } from "@/lib/database.types";

type BodyRegion = Database["public"]["Enums"]["body_region"];

/**
 * Knee-safe quad exercises for CURRENT knee injury first picks (PR #73).
 * These exercises safely load the quads without deep knee flexion or impact.
 */
export const KNEE_SAFE_QUAD_EXERCISES: ReadonlySet<string> = new Set([
  'leg-extensions',
  'single-leg-leg-extension',
  'wall-sit',
  'spanish-squat',
]);

/**
 * Exercises with slug-specific shoulder contraindications.
 * Around The Worlds: arms pass overhead in a wide arc, loading shoulders.
 */
const SHOULDER_CONTRAINDICATED_SLUGS: ReadonlySet<string> = new Set([
  "around-the-worlds",
]);

/**
 * Get derived contraindications from exercise properties.
 * Single source of truth for all contraindication derivation logic.
 * 
 * - vertical_press or "overhead" in name → shoulder
 * - spinal_load high → lower_back
 * - squat, lunge, or jump pattern/name → knee (UNLESS in knee-safe list)
 * 
 * Derived contraindications ADD to explicit tags, don't replace them.
 */
export function getDerivedContraindications(ex: CandidateExercise): BodyRegion[] {
  const derived: BodyRegion[] = [];
  const nameLower = ex.name.toLowerCase();
  const slugLower = ex.slug.toLowerCase();
  
  // Slug-specific shoulder contraindications
  if (SHOULDER_CONTRAINDICATED_SLUGS.has(ex.slug)) {
    derived.push("shoulder");
  }
  
  // Vertical press or overhead movements load shoulders
  if (ex.movement_pattern === "vertical_press" ||
      nameLower.includes("overhead") ||
      slugLower.includes("overhead") ||
      nameLower.includes("shoulder press") ||
      nameLower.includes("military press")) {
    derived.push("shoulder");
  }
  
  // High spinal load affects lower back (moderate is manageable for most)
  if (ex.spinal_load === "high") {
    derived.push("lower_back");
  }
  
  // Knee contraindication for squat/lunge/jump patterns (unless knee-safe)
  const isKneeLoad = 
    ex.movement_pattern === "squat" ||
    ex.movement_pattern === "lunge" ||
    nameLower.includes("squat") ||
    slugLower.includes("squat") ||
    nameLower.includes("lunge") ||
    slugLower.includes("lunge") ||
    nameLower.includes("jump") ||
    slugLower.includes("jump") ||
    nameLower.includes("box step") ||
    slugLower.includes("box-step");
  
  if (isKneeLoad && !KNEE_SAFE_QUAD_EXERCISES.has(ex.slug)) {
    derived.push("knee");
  }
  
  return derived;
}

/**
 * Check if an exercise is knee-risk for a knee user (past or current knee injury).
 * 
 * An exercise is knee-risk if:
 * - The user has anyKneeInjury = true (past or current)
 * - AND (exercise.contraindicated_regions includes "knee" OR derived contraindications include "knee")
 * 
 * This predicate is used to:
 * 1. Prevent knee-risk exercises from being selected for lunge slot fallbacks (past knee)
 * 2. Prevent time-fill strategies from pumping knee-risk exercises (any knee user)
 * 
 * @param ex The exercise to check
 * @param anyKneeInjury Whether the user has any knee injury (past or current)
 * @returns true if the exercise is knee-risk for this user
 */
export function isKneeRiskForKneeUser(
  ex: CandidateExercise,
  anyKneeInjury: boolean | undefined
): boolean {
  // Non-knee users: never knee-risk
  if (!anyKneeInjury) {
    return false;
  }
  
  // Check explicit contraindications
  if (ex.contraindicated_regions.includes("knee")) {
    return true;
  }
  
  // Check derived contraindications (squat/lunge pattern, unless in knee-safe list)
  const derived = getDerivedContraindications(ex);
  if (derived.includes("knee")) {
    return true;
  }
  
  return false;
}
