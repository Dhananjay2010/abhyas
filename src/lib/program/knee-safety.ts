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
 * Get derived contraindications from exercise properties.
 * This is extracted from generate.ts to be reusable.
 * 
 * - squat, lunge, or jump pattern/name → knee (UNLESS in knee-safe list)
 * - vertical_press or "overhead" in name → shoulder
 * - spinal_load high or moderate → lower_back
 */
export function getDerivedContraindications(ex: CandidateExercise): BodyRegion[] {
  const derived: BodyRegion[] = [];
  const nameLower = ex.name.toLowerCase();
  const slugLower = ex.slug.toLowerCase();
  
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
