/**
 * QA Steer (l): Shared swap validator used by swapExerciseCore.
 * 
 * Validates that a swap target is in the eligible swap list by rebuilding
 * the exact same eligibility chain that findAlternatives uses:
 * 1. isEligible (equipment, level, injury contraindications, Olympic lifts, etc.)
 * 2. rankAlternatives exclusions (Olympic lifts with anyKneeInjury, past-knee exclusions)
 * 
 * This ensures the server validator acceptance == swap-list membership exactly.
 */

import type { CandidateExercise, GeneratorInput } from "@/lib/program/generate";
import { isEligible, score, hashString } from "@/lib/program/generate";
import { rankAlternatives } from "@/lib/program/alternatives";
import { getSwapPatterns } from "@/lib/program/swap-patterns";

export type SwapValidatorInput = {
  newExerciseId: string;
  sessionExerciseId: string;
  currentExercise: CandidateExercise;
  pool: CandidateExercise[];
  validatorInput: GeneratorInput;
  profileLevel: string;
  availableEquipment: Set<string> | null;
  injuryRegions: string[];
  anyKneeInjury: boolean;
};

/**
 * Validates that newExerciseId is in the ranked swap list.
 * Returns true if valid, false if the swap should be rejected.
 */
export function isValidSwapTarget(input: SwapValidatorInput): boolean {
  const {
    newExerciseId,
    sessionExerciseId,
    currentExercise,
    pool,
    validatorInput,
    profileLevel,
    availableEquipment,
    injuryRegions,
    anyKneeInjury,
  } = input;
  
  // Filter by isEligible (same as findAlternatives)
  const eligible = pool.filter((e) => isEligible(e, validatorInput));
  
  // Get the final ranked alternatives (same as findAlternatives)
  const wantCompound = currentExercise.mechanic !== "isolation";
  const ranked = rankAlternatives(
    currentExercise,
    eligible,
    {
      level: profileLevel as any,
      availableEquipment,
      injuryRegions: injuryRegions as any[],
      anyKneeInjury,
      scoreFn: (e) => score(e, wantCompound, validatorInput.level, validatorInput.primaryTrack),
      tieBreakFn: (slug) => hashString(`${sessionExerciseId}:${slug}`),
    }
  );
  
  // Check if the requested exercise is in the eligible swap list
  return ranked.some(e => e.id === newExerciseId);
}

/**
 * Builds the pool of exercises for swap validation.
 * Returns candidate exercises matching the swap patterns.
 */
export function buildSwapPool(
  currentExercise: CandidateExercise,
  allExercises: CandidateExercise[],
  validatorInput: GeneratorInput
): CandidateExercise[] {
  const patterns = getSwapPatterns(currentExercise.movement_pattern, validatorInput);
  return allExercises.filter(e => patterns.includes(e.movement_pattern));
}
