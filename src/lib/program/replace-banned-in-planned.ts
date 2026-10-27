/**
 * Replace banned exercises in planned sessions for knee-injured users.
 * 
 * Applies to NOT-YET-STARTED planned sessions only (no logged sets, no completed days).
 * Logged sets, completed days, and in-progress sessions are never touched.
 * 
 * Banned exercises:
 * - single-leg-leg-extension (past-knee only)
 * - calf-press-on-the-leg-press-machine (past-knee only)  
 * - landmine-linear-jammer (ANY knee)
 * - single-arm-linear-jammer (ANY knee)
 */

import type { CandidateExercise, GeneratorInput } from "@/lib/program/generate";
import { isEligible, score, hashString } from "@/lib/program/generate";
import { rankAlternatives } from "@/lib/program/alternatives";
import { getSwapPatterns } from "@/lib/program/swap-patterns";
import { buildSwapContext } from "@/lib/program/swap-context";

const PAST_KNEE_BANNED = new Set([
  "single-leg-leg-extension",
  "calf-press-on-the-leg-press-machine",
]);

const ANY_KNEE_BANNED = new Set([
  "landmine-linear-jammer",
  "single-arm-linear-jammer",
]);

export type PlannedExercise = {
  exercise_id: string;
  order_index: number;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_seconds: number | null;
};

export function shouldReplaceBannedExercise(
  exerciseSlug: string,
  hasPastKnee: boolean,
  hasAnyKnee: boolean,
): boolean {
  if (hasAnyKnee && ANY_KNEE_BANNED.has(exerciseSlug)) return true;
  if (hasPastKnee && PAST_KNEE_BANNED.has(exerciseSlug)) return true;
  return false;
}

/**
 * Replace banned exercises in a planned exercise list.
 * Returns a new list with banned exercises replaced by safe alternatives.
 * Non-knee users and non-banned exercises pass through unchanged.
 * Deterministic: same exercise + profile → same replacement.
 */
export function replaceBannedInPlanned(
  planned: PlannedExercise[],
  catalogue: CandidateExercise[],
  generatorInput: GeneratorInput,
  sessionExerciseIdSeed: string,
): PlannedExercise[] {
  const hasPastKnee = generatorInput.anyKneeInjury && generatorInput.currentInjuryRegions.length === 0;
  const hasAnyKnee = generatorInput.anyKneeInjury;
  
  // No knee injury: pass through unchanged
  if (!hasAnyKnee) return planned;
  
  const catalogueById = new Map(catalogue.map(e => [e.id, e]));
  const catalogueBySlug = new Map(catalogue.map(e => [e.slug, e]));
  
  const result: PlannedExercise[] = [];
  const alreadyUsed = new Set<string>();
  
  for (const ex of planned) {
    const exercise = catalogueById.get(ex.exercise_id);
    if (!exercise) {
      result.push(ex);
      continue;
    }
    
    alreadyUsed.add(exercise.id);
    
    const needsReplacement = shouldReplaceBannedExercise(
      exercise.slug,
      hasPastKnee,
      hasAnyKnee,
    );
    
    if (!needsReplacement) {
      result.push(ex);
      continue;
    }
    
    // Find replacement using same logic as generator/swaps
    const patterns = getSwapPatterns(exercise.movement_pattern, generatorInput);
    const patternMatches = catalogue.filter(e => patterns.includes(e.movement_pattern));
    const eligible = patternMatches
      .filter(e => !alreadyUsed.has(e.id))
      .filter(e => isEligible(e, generatorInput));
    
    // mechanic can be compound, isolation, or null - treat null as compound
    const wantCompound = exercise.mechanic !== "isolation";
    const scoreFn = (e: CandidateExercise) => 
      score(e, wantCompound, generatorInput.level, generatorInput.primaryTrack);
    const tieBreakFn = (slug: string) => 
      hashString(`${sessionExerciseIdSeed}:${ex.order_index}:${slug}`);
    
    const swapContext = buildSwapContext(generatorInput, scoreFn, tieBreakFn);
    const ranked = rankAlternatives(exercise, eligible, swapContext);
    
    if (ranked.length > 0) {
      const replacement = ranked[0];
      alreadyUsed.add(replacement.id);
      result.push({
        ...ex,
        exercise_id: replacement.id,
      });
    } else {
      // No replacement found: keep the banned exercise (safety: don't break the day)
      result.push(ex);
    }
  }
  
  return result;
}
