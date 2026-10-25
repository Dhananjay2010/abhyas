#!/usr/bin/env tsx
/**
 * Real-path test: Validator rejects banned swaps.
 * 
 * Tests that:
 * 1. Current knee injury cannot swap to barbell-full-squat (contraindicated)
 * 2. Current shoulder injury cannot swap to arnold-dumbbell-press (contraindicated)
 * 
 * Uses the real validator logic via swapExerciseCore with real dependencies.
 */

import { swapExerciseCore, type SwapExerciseDeps, type SwapExerciseCoreInput } from "@/lib/session/swap-exercise-core";
import { isValidSwapTarget, buildSwapPool } from "@/lib/session/swap-validator";
import catalogue from "./fixtures/catalogue.json";
import type { CandidateExercise, GeneratorInput } from "@/lib/program/generate";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? ` -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? ` -- ${detail}` : ""}`);
    process.exit(1);
  }
}

const allExercises = catalogue as unknown as CandidateExercise[];

async function testBannedSwapRejection(): Promise<void> {
  console.log("Running banned swap rejection tests...\n");

  // Test 1: Current knee injury tries to swap to barbell-full-squat (banned)
  {
    console.log("Test 1: Current knee → barbell-full-squat (banned)\n");

    const currentExercise = allExercises.find(e => e.slug === "barbell-squat")!;
    const bannedExercise = allExercises.find(e => e.slug === "barbell-full-squat")!;

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
      hasAllEquipment: false,
      equipmentIds: ["barbell", "bench"],
      currentInjuryRegions: ["knee"],
      anyKneeInjury: true,
      catalogue: [],
    };

    const pool = buildSwapPool(currentExercise, allExercises, validatorInput);

    const sessionExerciseId = "se-current-knee";
    const isValid = isValidSwapTarget({
      newExerciseId: bannedExercise.id,
      sessionExerciseId,
      currentExercise,
      pool,
      validatorInput,
      profileLevel: "intermediate",
      availableEquipment: new Set(["barbell", "bench"]),
      injuryRegions: ["knee"],
      anyKneeInjury: true,
    });

    check(
      "Validator rejects barbell-full-squat for current knee",
      !isValid,
      `expected false, got ${isValid}`
    );

    // Now test via swapExerciseCore
    const deps: SwapExerciseDeps = {
      resolveSwapWeights: async () => ({
        weightPrefill: 100,
        workingWeightKg: 100,
        currentTargetReps: 10,
        isBodyweight: false,
      }),
      validateSwapTarget: async (input: { newExerciseId: string; sessionExerciseId: string }) => {
        return isValidSwapTarget({
          newExerciseId: input.newExerciseId,
          sessionExerciseId: input.sessionExerciseId,
          currentExercise,
          pool,
          validatorInput,
          profileLevel: "intermediate",
          availableEquipment: new Set(["barbell", "bench"]),
          injuryRegions: ["knee"],
          anyKneeInjury: true,
        });
      },
    };

    const swapInput: SwapExerciseCoreInput = {
      newExerciseId: bannedExercise.id,
      sessionExerciseId,
      current: {
        exercise_id: currentExercise.id,
        metric: "reps",
        planned_reps_min: 8,
        planned_reps_max: 12,
        session_id: "session-test",
      },
      replacement: {
        metric: bannedExercise.metric,
        mechanic: bannedExercise.mechanic,
        equipment_ids: bannedExercise.equipment_ids,
        movement_pattern: bannedExercise.movement_pattern,
      },
      profile: {
        goal: "strength",
        level: "intermediate",
      },
    };

    const result = await swapExerciseCore(deps, swapInput);

    check(
      "swapExerciseCore rejects banned swap",
      !result.ok,
      `expected ok=false, got ok=${result.ok}`
    );

    if (!result.ok) {
      check(
        "Error message mentions swap unavailability",
        result.error.includes("not available") || result.error.includes("not valid") || result.error.includes("not eligible"),
        `got error: ${result.error}`
      );
    }

    console.log("✓ Test 1 passed\n");
  }

  // Test 2: Current shoulder injury tries to swap to arnold-dumbbell-press (banned)
  {
    console.log("Test 2: Current shoulder → arnold-dumbbell-press (banned)\n");

    const currentExercise = allExercises.find(e => e.slug === "dumbbell-shoulder-press")!;
    const bannedExercise = allExercises.find(e => e.slug === "arnold-dumbbell-press")!;

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
      hasAllEquipment: false,
      equipmentIds: ["dumbbell", "bench"],
      currentInjuryRegions: ["shoulder"],
      anyKneeInjury: false,
      catalogue: [],
    };

    const pool = buildSwapPool(currentExercise, allExercises, validatorInput);

    const sessionExerciseId = "se-current-shoulder";
    const isValid = isValidSwapTarget({
      newExerciseId: bannedExercise.id,
      sessionExerciseId,
      currentExercise,
      pool,
      validatorInput,
      profileLevel: "intermediate",
      availableEquipment: new Set(["dumbbell", "bench"]),
      injuryRegions: ["shoulder"],
      anyKneeInjury: false,
    });

    check(
      "Validator rejects arnold-dumbbell-press for current shoulder",
      !isValid,
      `expected false, got ${isValid}`
    );

    // Now test via swapExerciseCore
    const deps: SwapExerciseDeps = {
      resolveSwapWeights: async () => ({
        weightPrefill: 20,
        workingWeightKg: 20,
        currentTargetReps: 10,
        isBodyweight: false,
      }),
      validateSwapTarget: async (input: { newExerciseId: string; sessionExerciseId: string }) => {
        return isValidSwapTarget({
          newExerciseId: input.newExerciseId,
          sessionExerciseId: input.sessionExerciseId,
          currentExercise,
          pool,
          validatorInput,
          profileLevel: "intermediate",
          availableEquipment: new Set(["dumbbell", "bench"]),
          injuryRegions: ["shoulder"],
          anyKneeInjury: false,
        });
      },
    };

    const swapInput: SwapExerciseCoreInput = {
      newExerciseId: bannedExercise.id,
      sessionExerciseId,
      current: {
        exercise_id: currentExercise.id,
        metric: "reps",
        planned_reps_min: 8,
        planned_reps_max: 12,
        session_id: "session-test",
      },
      replacement: {
        metric: bannedExercise.metric,
        mechanic: bannedExercise.mechanic,
        equipment_ids: bannedExercise.equipment_ids,
        movement_pattern: bannedExercise.movement_pattern,
      },
      profile: {
        goal: "strength",
        level: "intermediate",
      },
    };

    const result = await swapExerciseCore(deps, swapInput);

    check(
      "swapExerciseCore rejects banned swap",
      !result.ok,
      `expected ok=false, got ok=${result.ok}`
    );

    if (!result.ok) {
      check(
        "Error message mentions swap unavailability",
        result.error.includes("not available") || result.error.includes("not valid") || result.error.includes("not eligible"),
        `got error: ${result.error}`
      );
    }

    console.log("✓ Test 2 passed\n");
  }

  console.log("✅ All banned swap rejection tests passed");
}

async function main(): Promise<void> {
  try {
    await testBannedSwapRejection();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
