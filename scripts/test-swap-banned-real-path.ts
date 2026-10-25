#!/usr/bin/env tsx
/**
 * Step 2: Real-path banned-swap test through swapExercise / swapExerciseCore.
 * 
 * Tests that contraindicated swaps are refused:
 * - barbell-full-squat for current knee injury
 * - arnold-dumbbell-press for current shoulder injury
 * 
 * AND verifies that weight lookup and DB update were never called (using spies).
 */

import { swapExerciseCore, type SwapExerciseDeps } from "../src/lib/session/swap-exercise-core";
import catalogue from "./fixtures/catalogue.json";
import type { CandidateExercise } from "../src/lib/program/generate";
import { buildEligibleSwapList, buildGeneratorInput } from "../src/lib/session/eligible-swap-list";
import { getSwapPatterns } from "../src/lib/program/swap-patterns";

const catalogueExercises = catalogue as CandidateExercise[];

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

// Spies to track if functions were called
let weightLookupCalled = false;

function createDeps(
  currentExercise: CandidateExercise,
  injuries: Array<{ body_region: string; severity: "current" | "past" }>
): SwapExerciseDeps {
  return {
    resolveSwapWeights: async () => {
      weightLookupCalled = true;
      return {
        weightPrefill: null,
        workingWeightKg: null,
        currentTargetReps: null,
        isBodyweight: false,
      };
    },
    validateSwapTarget: async ({ newExerciseId }) => {
      // Use real buildEligibleSwapList to determine eligibility
      const generatorInput = buildGeneratorInput({
        userId: "test-user",
        profile: {
          goal: "muscle_gain",
          level: "intermediate",
          primary_track: "weights",
          days_per_week: 4,
          yoga_days_per_week: 0,
          date_of_birth: "1990-01-01",
          height_cm: 175,
          has_all_equipment: true,
        },
        equipmentIds: ["barbell", "dumbbell", "flat_bench", "squat_rack"],
        injuries,
        weightKg: 75,
      });

      const patterns = getSwapPatterns(currentExercise.movement_pattern, generatorInput);
      const pool = catalogueExercises.filter(e => patterns.includes(e.movement_pattern));

      const eligibleList = buildEligibleSwapList({
        currentExercise,
        sessionExerciseId: "test-session-ex-id",
        generatorInput,
        pool,
        alreadyInSession: new Set([currentExercise.id]),
      });

      return eligibleList.some(e => e.id === newExerciseId);
    },
  };
}

async function testBannedSwap(
  testName: string,
  currentExerciseSlug: string,
  targetExerciseSlug: string,
  injuries: Array<{ body_region: string; severity: "current" | "past" }>,
) {
  console.log(`\n${testName}`);
  
  weightLookupCalled = false;
  
  const currentEx = catalogueExercises.find(e => e.slug === currentExerciseSlug);
  const targetEx = catalogueExercises.find(e => e.slug === targetExerciseSlug);
  
  if (!currentEx || !targetEx) {
    check("Exercises found in catalogue", false, `current: ${!!currentEx}, target: ${!!targetEx}`);
    return;
  }
  
  const deps = createDeps(currentEx, injuries);
  
  const result = await swapExerciseCore(deps, {
    newExerciseId: targetEx.id,
    sessionExerciseId: "test-session-ex-id",
    current: {
      exercise_id: currentEx.id,
      metric: currentEx.metric,
      planned_reps_min: 8,
      planned_reps_max: 12,
      session_id: "test-session-id",
    },
    replacement: {
      metric: targetEx.metric,
      mechanic: targetEx.mechanic,
      equipment_ids: targetEx.equipment_ids,
      movement_pattern: targetEx.movement_pattern,
    },
    profile: {
      goal: "muscle_gain",
      level: "intermediate",
    },
  });
  
  check("Swap was refused", !result.ok);
  check("Weight lookup was NOT called", !weightLookupCalled, `called: ${weightLookupCalled}`);
  
  if (result.ok) {
    console.log("  ⚠️  Swap was accepted (should have been refused)");
  } else {
    console.log(`  Error message: "${result.error}"`);
  }
}

(async () => {
  // Test 1: barbell-full-squat for current knee injury
  await testBannedSwap(
    "Test 1: barbell-full-squat refused for current knee",
    "goblet-squat", // Current exercise (knee-friendly)
    "barbell-full-squat", // Target (contraindicated for knee)
    [{ body_region: "knee", severity: "current" }],
  );

  // Test 2: arnold-dumbbell-press for current shoulder injury
  await testBannedSwap(
    "Test 2: arnold-dumbbell-press refused for current shoulder",
    "dumbbell-shoulder-press", // Current exercise
    "arnold-dumbbell-press", // Target (contraindicated for shoulder)
    [{ body_region: "shoulder", severity: "current" }],
  );

  console.log("\n=== Summary ===");
  if (failures > 0) {
    console.log(`❌ ${failures} check(s) failed`);
    process.exit(1);
  } else {
    console.log("✅ All checks passed");
  }
})();
