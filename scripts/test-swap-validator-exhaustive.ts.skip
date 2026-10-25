#!/usr/bin/env tsx
/**
 * Exhaustive equality test: validator acceptance == swap list membership.
 * 
 * For every exercise in the catalogue × 8 user profiles, verifies that:
 * - isValidSwapTarget accepts exercise X
 * - IFF exercise X is in the ranked swap list produced by buildSwapPool + isEligible + rankAlternatives
 * 
 * This ensures server-side validation matches the swap sheet exactly.
 */

import catalogue from "./fixtures/catalogue.json";
import { isValidSwapTarget, buildSwapPool } from "../src/lib/session/swap-validator";
import { isEligible, score, hashString } from "../src/lib/program/generate";
import { rankAlternatives } from "../src/lib/program/alternatives";
import type { GeneratorInput, CandidateExercise } from "../src/lib/program/generate";

const PROFILES: Array<{
  name: string;
  level: "beginner" | "intermediate" | "expert";
  equipment: string[];
  injuries: Array<{ region: "knee" | "shoulder" | "wrist" | "elbow" | "lower_back"; severity: "mild" | "moderate" | "severe"; tier: "current" | "past" }>;
  bmi: number;
  age?: number;
}> = [
  {
    name: "Current Knee",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [{ region: "knee", severity: "moderate", tier: "current" }],
    bmi: 24,
  },
  {
    name: "Past Knee",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [{ region: "knee", severity: "mild", tier: "past" }],
    bmi: 24,
  },
  {
    name: "Current Shoulder",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [{ region: "shoulder", severity: "moderate", tier: "current" }],
    bmi: 24,
  },
  {
    name: "Current Wrist",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [{ region: "wrist", severity: "moderate", tier: "current" }],
    bmi: 24,
  },
  {
    name: "Current Lower Back",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [{ region: "lower_back", severity: "moderate", tier: "current" }],
    bmi: 24,
  },
  {
    name: "No Injury",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [],
    bmi: 24,
  },
  {
    name: "Beginner Bodyweight Only",
    level: "beginner",
    equipment: [],
    injuries: [],
    bmi: 24,
  },
  {
    name: "Age 62 BMI 36",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "bench"],
    injuries: [],
    bmi: 36,
    age: 62,
  },
];

function buildGeneratorInput(profile: typeof PROFILES[0]): GeneratorInput {
  const currentInjuries = profile.injuries.filter(i => i.tier === "current");
  return {
    userId: "test-user",
    blockNumber: 1,
    goal: "strength",
    level: profile.level,
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: profile.age ?? 30,
    bmi: profile.bmi,
    hasAllEquipment: profile.equipment.length === 0,
    equipmentIds: profile.equipment,
    currentInjuryRegions: currentInjuries.map(i => i.region),
    anyKneeInjury: profile.injuries.some(i => i.region === "knee"),
    catalogue: [],
  };
}

/**
 * Builds the "findAlternatives" list using the exact same logic:
 * 1. Filter pool by swap patterns
 * 2. Filter by isEligible
 * 3. Rank with rankAlternatives
 */
function buildAlternativesList(
  currentExercise: CandidateExercise,
  allExercises: CandidateExercise[],
  validatorInput: GeneratorInput,
  sessionExerciseId: string
): CandidateExercise[] {
  const pool = buildSwapPool(currentExercise, allExercises, validatorInput);
  const eligible = pool.filter(e => isEligible(e, validatorInput));
  const wantCompound = currentExercise.mechanic !== "isolation";
  
  const ranked = rankAlternatives(
    currentExercise,
    eligible,
    {
      level: validatorInput.level,
      availableEquipment: validatorInput.hasAllEquipment ? null : new Set(validatorInput.equipmentIds),
      injuryRegions: validatorInput.currentInjuryRegions,
      anyKneeInjury: validatorInput.anyKneeInjury ?? false,
      scoreFn: (e) => score(e, wantCompound, validatorInput.level, validatorInput.primaryTrack),
      tieBreakFn: (slug) => hashString(`${sessionExerciseId}:${slug}`),
    }
  );
  
  return ranked;
}

async function testExhaustiveEquality(): Promise<void> {
  console.log("Running exhaustive validator equality test...\n");
  
  const exerciseCatalogue = catalogue as unknown as CandidateExercise[];
  const weightsExercises = exerciseCatalogue.filter(e => 
    e.tracks.includes("weights")
  );

  let totalTests = 0;
  let passed = 0;
  let mismatches: Array<{ profile: string; current: string; candidate: string; validatorAccepts: boolean; inList: boolean }> = [];

  for (const profile of PROFILES) {
    console.log(`Testing profile: ${profile.name}...`);
    const input = buildGeneratorInput(profile);

    for (const currentExercise of weightsExercises) {
      // Skip exercises not available to this profile
      if (!input.hasAllEquipment && currentExercise.equipment_ids.length > 0) {
        const hasEquipment = currentExercise.equipment_ids.every((eq: string) => 
          input.equipmentIds.includes(eq)
        );
        if (!hasEquipment) continue;
      }

      const sessionExerciseId = `test-se-${currentExercise.id}`;

      // Build the alternatives list (same logic as swap sheet)
      const alternatives = buildAlternativesList(currentExercise, weightsExercises, input, sessionExerciseId);
      const alternativeIds = new Set(alternatives.map(a => a.id));

      // Build swap pool for validator
      const pool = buildSwapPool(currentExercise, weightsExercises, input);

      for (const candidate of weightsExercises) {
        totalTests++;

        const validatorAccepts = isValidSwapTarget({
          newExerciseId: candidate.id,
          sessionExerciseId,
          currentExercise,
          pool,
          validatorInput: input,
          profileLevel: input.level,
          availableEquipment: input.hasAllEquipment ? null : new Set(input.equipmentIds),
          injuryRegions: input.currentInjuryRegions,
          anyKneeInjury: input.anyKneeInjury ?? false,
        });

        const inAlternativesList = alternativeIds.has(candidate.id);

        if (validatorAccepts !== inAlternativesList) {
          mismatches.push({
            profile: profile.name,
            current: currentExercise.id,
            candidate: candidate.id,
            validatorAccepts,
            inList: inAlternativesList,
          });
        } else {
          passed++;
        }
      }
    }

    console.log(`✓ ${profile.name} validated`);
  }

  if (mismatches.length > 0) {
    console.error(`\n❌ Found ${mismatches.length} mismatches:\n`);
    for (const m of mismatches.slice(0, 10)) {
      console.error(
        `  ${m.profile}: ${m.current} → ${m.candidate}`,
        `validator=${m.validatorAccepts}, list=${m.inList}`
      );
    }
    if (mismatches.length > 10) {
      console.error(`  ... and ${mismatches.length - 10} more`);
    }
    throw new Error("Validator and alternatives list disagree");
  }

  console.log(`\n✅ Exhaustive equality test passed: ${passed}/${totalTests} checks`);
}

async function main(): Promise<void> {
  try {
    await testExhaustiveEquality();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
