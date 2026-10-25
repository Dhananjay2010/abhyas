#!/usr/bin/env tsx
/**
 * QA Steer (k): Wall-sit swap demotion test.
 * 
 * Ensures that for past-knee squat swaps:
 * 1. wall-sit is never index 0
 * 2. wall-sit is at index >= 2 when 3+ alternatives exist
 * 
 * Tests across bodyweight, band, barbell, and dumbbell equipment sets.
 */

import catalogue from "./fixtures/catalogue.json";
import { rankAlternatives } from "../src/lib/program/alternatives";
import { isEligible, score, hashString } from "../src/lib/program/generate";
import type { CandidateExercise, GeneratorInput } from "../src/lib/program/generate";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? ` -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? ` -- ${detail}` : ""}`);
    process.exit(1);
  }
}

const allExercises = catalogue as unknown as CandidateExercise[];

const EQUIPMENT_SETS = [
  { name: "Bodyweight", equipment: [] },
  { name: "Band", equipment: ["band"] },
  { name: "Barbell", equipment: ["barbell"] },
  { name: "Dumbbell", equipment: ["dumbbell"] },
];

async function testWallSitDemotion(): Promise<void> {
  console.log("Running wall-sit demotion tests...\n");

  for (const equipmentSet of EQUIPMENT_SETS) {
    console.log(`Testing ${equipmentSet.name} equipment set...`);

    const validatorInput: GeneratorInput = {
      userId: "test-user",
      blockNumber: 1,
      goal: "strength",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 3,
      yogaDaysPerWeek: 0,
      age: 30,
      bmi: 24,
      hasAllEquipment: equipmentSet.equipment.length === 0,
      equipmentIds: equipmentSet.equipment,
      currentInjuryRegions: [],
      anyKneeInjury: true,
      catalogue: [],
    };

    // Find a squat exercise to swap from
    const currentExercise = allExercises.find(e => 
      e.movement_pattern === "squat" && 
      e.slug === "barbell-squat"
    )!;

    if (!currentExercise) {
      throw new Error("Could not find barbell-squat");
    }

    // Get squat-pattern exercises
    const pool = allExercises.filter(e => e.movement_pattern === "squat");
    const eligible = pool.filter(e => isEligible(e, validatorInput));

    const ranked = rankAlternatives(
      currentExercise,
      eligible,
      {
        level: validatorInput.level,
        availableEquipment: validatorInput.hasAllEquipment ? null : new Set(validatorInput.equipmentIds),
        injuryRegions: validatorInput.currentInjuryRegions,
        anyKneeInjury: validatorInput.anyKneeInjury ?? false,
        scoreFn: (e) => score(e, true, validatorInput.level, validatorInput.primaryTrack),
        // Tiebreak that deliberately favors wall-sit (lowest value wins)
        tieBreakFn: (slug) => slug === "wall-sit" ? 0 : hashString(`test:${slug}`),
      }
    );

    const wallSitIndex = ranked.findIndex(e => e.slug === "wall-sit");

    if (wallSitIndex !== -1) {
      // wall-sit is in the list - it must NEVER be at index 0
      check(
        `wall-sit is never at index 0`,
        wallSitIndex !== 0,
        `got index ${wallSitIndex}, list: ${ranked.map(e => e.slug).join(", ")}`
      );

      // When 3+ alternatives exist, wall-sit must be at index >= 2
      if (ranked.length >= 3) {
        check(
          `wall-sit is at index >= 2 when ${ranked.length} items exist`,
          wallSitIndex >= 2,
          `got index ${wallSitIndex}, list: ${ranked.map(e => e.slug).join(", ")}`
        );
      }
      
      // Additional check: wall-sit should be at the end
      check(
        `wall-sit is at the end (last position)`,
        wallSitIndex === ranked.length - 1,
        `got index ${wallSitIndex} of ${ranked.length}`
      );
    } else {
      console.log(`  (wall-sit not in ranked list for ${equipmentSet.name})`);
    }

    console.log(`  ✓ ${equipmentSet.name} passed\n`);
  }

  console.log("✅ All wall-sit demotion tests passed");
}

async function main(): Promise<void> {
  try {
    await testWallSitDemotion();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
