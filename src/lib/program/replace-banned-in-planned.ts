/**
 * Replace banned exercises in planned sessions for knee-injured users.
 * 
 * Applies to program_day_exercises only (weekly templates).
 * Logged sets and completed sessions are never touched.
 * 
 * Banned exercises come from shared knee-tier lists in past-knee.ts.
 */

import type { CandidateExercise, GeneratorInput } from "@/lib/program/generate";
import { buildEligibleSwapList } from "@/lib/session/eligible-swap-list";
import { getKneeBannedSlugs, type KneeTier } from "@/lib/program/past-knee";

export type PlannedExercise = {
  id: string;
  exercise_id: string;
  order_index: number;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_seconds: number | null;
};

export type ReplacementResult = {
  rows: PlannedExercise[];
  changed: boolean;
};

function determineKneeTier(
  anyKneeInjury: boolean | undefined,
  currentInjuryRegions: string[],
): KneeTier | null {
  if (!anyKneeInjury) return null;
  
  const hasCurrentKnee = currentInjuryRegions.includes("knee");
  return hasCurrentKnee ? "current" : "past";
}

export function shouldReplaceBannedExercise(
  exerciseSlug: string,
  tier: KneeTier | null,
): boolean {
  if (!tier) return false;
  
  const bannedSlugs = getKneeBannedSlugs(tier);
  return bannedSlugs.has(exerciseSlug);
}

/**
 * Replace banned exercises in a planned exercise list.
 * Returns new rows and a changed flag.
 * Non-knee users and non-banned exercises pass through unchanged.
 * Deterministic: same exercise + profile + seed → same replacement.
 */
export function replaceBannedInPlanned(
  planned: PlannedExercise[],
  catalogue: CandidateExercise[],
  generatorInput: GeneratorInput,
): ReplacementResult {
  const tier = determineKneeTier(
    generatorInput.anyKneeInjury,
    generatorInput.currentInjuryRegions,
  );
  
  if (!tier) {
    return { rows: planned, changed: false };
  }
  
  const catalogueById = new Map(catalogue.map(e => [e.id, e]));
  const alreadyInSession = new Set(
    planned
      .map(ex => catalogueById.get(ex.exercise_id))
      .filter((e): e is CandidateExercise => !!e)
      .map(e => e.id)
  );
  
  let changed = false;
  const result: PlannedExercise[] = [];
  
  for (const ex of planned) {
    const exercise = catalogueById.get(ex.exercise_id);
    if (!exercise) {
      result.push(ex);
      continue;
    }
    
    const needsReplacement = shouldReplaceBannedExercise(exercise.slug, tier);
    
    if (!needsReplacement) {
      result.push(ex);
      continue;
    }
    
    const swapList = buildEligibleSwapList({
      currentExercise: exercise,
      sessionExerciseId: ex.id,
      generatorInput,
      pool: catalogue,
      alreadyInSession,
    });
    
    if (swapList.length > 0) {
      const replacement = swapList[0];
      alreadyInSession.delete(exercise.id);
      alreadyInSession.add(replacement.id);
      result.push({
        ...ex,
        exercise_id: replacement.id,
      });
      changed = true;
    } else {
      // No safe alternative: drop the slot for current-knee users only
      if (tier === "current") {
        changed = true;
        // Don't push to result - slot is dropped
      } else {
        result.push(ex);
      }
    }
  }
  
  return { rows: result, changed };
}
