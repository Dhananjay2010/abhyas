/**
 * Step 1: Single source of truth for swap eligibility.
 * 
 * This function builds the eligible swap list for a session exercise,
 * applying the same filters and ranking that findAlternatives uses.
 * 
 * The validator accepts a target iff it's in this function's output.
 * This ensures validator acceptance == swap-list membership exactly.
 */

import type { Database } from "@/lib/database.types";
import type { CandidateExercise, GeneratorInput } from "@/lib/program/generate";
import { isEligible, score, hashString } from "@/lib/program/generate";
import { rankAlternatives } from "@/lib/program/alternatives";
import { getSwapPatterns } from "@/lib/program/swap-patterns";
import { buildSwapContext } from "@/lib/program/swap-context";

export type EligibleSwapListInput = {
  /** The exercise being swapped out */
  currentExercise: CandidateExercise;
  /** Session exercise ID for tie-breaking */
  sessionExerciseId: string;
  /** User's profile and injury data */
  generatorInput: GeneratorInput;
  /** All candidate exercises (from database query) */
  pool: CandidateExercise[];
  /** Exercises already in this session (to exclude) */
  alreadyInSession: Set<string>;
};

/**
 * Build the eligible swap list for a session exercise.
 * 
 * Returns exercises that:
 * 1. Match the swap patterns (current + fallbacks + knee-safe if applicable)
 * 2. Pass isEligible (equipment, level, injury contraindications, Olympic lifts, etc.)
 * 3. Are not already in the session
 * 4. Pass rankAlternatives filters (Olympic lifts with anyKneeInjury, past-knee exclusions)
 * 
 * The list is ranked by score and tie-broken by hash for stability.
 */
export function buildEligibleSwapList(input: EligibleSwapListInput): CandidateExercise[] {
  const {
    currentExercise,
    sessionExerciseId,
    generatorInput,
    pool,
    alreadyInSession,
  } = input;

  // Filter pool to swap patterns
  const patterns = getSwapPatterns(currentExercise.movement_pattern, generatorInput);
  const patternMatches = pool.filter(e => patterns.includes(e.movement_pattern));

  // Filter by isEligible (generator safety rules: age, BMI, spinal load, etc.)
  // and exclude exercises already in the session
  const eligible = patternMatches
    .filter(e => !alreadyInSession.has(e.id))
    .filter(e => isEligible(e, generatorInput));

  // Rank alternatives (applies further filters like Olympic lifts, past-knee exclusions)
  const wantCompound = currentExercise.mechanic !== "isolation";
  const scoreFn = (e: CandidateExercise) => 
    score(e, wantCompound, generatorInput.level, generatorInput.primaryTrack);
  const tieBreakFn = (slug: string) => hashString(`${sessionExerciseId}:${slug}`);
  
  const swapContext = buildSwapContext(generatorInput, scoreFn, tieBreakFn);
  
  const ranked = rankAlternatives(
    currentExercise,
    eligible,
    swapContext,
  );

  return ranked;
}

/**
 * Helper to build GeneratorInput from profile and injury data.
 * Used by both findAlternatives and swapExercise to ensure consistency.
 */
export function buildGeneratorInput(params: {
  userId: string;
  profile: {
    goal: Database["public"]["Enums"]["fitness_goal"];
    level: Database["public"]["Enums"]["fitness_level"];
    primary_track: Database["public"]["Enums"]["track_type"];
    days_per_week: number;
    yoga_days_per_week: number;
    date_of_birth: string | null;
    height_cm: number | null;
    has_all_equipment: boolean;
  };
  equipmentIds: string[];
  injuries: Array<{
    body_region: Database["public"]["Enums"]["body_region"];
    severity: "current" | "past";
  }>;
  weightKg: number | null;
}): GeneratorInput {
  const { userId, profile, equipmentIds, injuries, weightKg } = params;
  
  const bmi = weightKg && profile.height_cm
    ? weightKg / (profile.height_cm / 100) ** 2
    : null;

  const age = profile.date_of_birth 
    ? (() => {
        const dob = new Date(profile.date_of_birth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
          age--;
        }
        return age;
      })()
    : null;

  // Build injury flags
  const currentInjuryRegions = injuries
    .filter(i => i.severity === "current")
    .map(i => i.body_region);
  
  const anyKneeInjury = injuries.some(i => 
    i.body_region === "knee"
  );

  return {
    userId,
    blockNumber: 1,
    goal: profile.goal,
    level: profile.level,
    primaryTrack: profile.primary_track,
    daysPerWeek: profile.days_per_week,
    yogaDaysPerWeek: profile.yoga_days_per_week,
    age,
    bmi,
    hasAllEquipment: profile.has_all_equipment,
    equipmentIds,
    currentInjuryRegions,
    anyKneeInjury,
    catalogue: [], // Not needed for swap list building
  };
}
