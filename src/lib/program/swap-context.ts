/**
 * Swap Context Builder
 * 
 * Builds the context for ranking exercise alternatives/swaps.
 */
import type { AlternativesContext } from "./alternatives";
import type { GeneratorInput, CandidateExercise } from "./generate";

export function buildSwapContext(
  input: GeneratorInput,
  scoreFn: (e: CandidateExercise) => number,
  tieBreakFn: (slug: string) => number,
): Omit<AlternativesContext, "pattern"> {
  return {
    level: input.level,
    availableEquipment: input.hasAllEquipment ? null : new Set(input.equipmentIds),
    injuryRegions: input.currentInjuryRegions,
    anyKneeInjury: input.anyKneeInjury,
    limit: 5,
    scoreFn,
    tieBreakFn,
  };
}
