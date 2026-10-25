#!/usr/bin/env tsx
/**
 * Test swap-exercise-core with fakes (S1, S2, S3).
 * 
 * Verifies the call-site wiring:
 * - S3: passes input.newExerciseId (not the old id) to resolveSwapWeights
 * - S1: returns weightPrefill unchanged
 * - S2: returns workingWeightKg unchanged
 * 
 * Mutants S1, S2, S3 must FAIL this test.
 */

import { swapExerciseCore, type SwapExerciseDeps, type SwapExerciseCoreInput } from "@/lib/session/swap-exercise-core";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? ` -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? ` -- ${detail}` : ""}`);
    process.exit(1);
  }
}

async function main() {
  console.log("Test swap-exercise-core (S1, S2, S3)\n");

  const OLD_EXERCISE_ID = "old-exercise-id";
  const NEW_EXERCISE_ID = "new-exercise-id";
  const SESSION_ID = "session-123";

  // Fake resolveSwapWeights that records which exercise id it received
  let capturedExerciseId: string | null = null;
  const fakeResolveSwapWeights: SwapExerciseDeps["resolveSwapWeights"] = async (
    _,
    newExerciseId,
    equipmentIds,
  ) => {
    capturedExerciseId = newExerciseId;
    // Return distinct values so we can verify they're passed through unchanged
    return {
      weightPrefill: 42.5,
      workingWeightKg: 100,
      currentTargetReps: 10,
      isBodyweight: equipmentIds.length === 0,
    };
  };

  const input: SwapExerciseCoreInput = {
    newExerciseId: NEW_EXERCISE_ID,
    sessionExerciseId: "session-exercise-123",
    current: {
      exercise_id: OLD_EXERCISE_ID,
      metric: "reps" as const,
      planned_reps_min: 8,
      planned_reps_max: 12,
      session_id: SESSION_ID,
    },
    replacement: {
      metric: "reps" as const,
      mechanic: "compound" as const,
      equipment_ids: ["barbell"],
      movement_pattern: "horizontal_press" as const,
    },
    profile: {
      goal: "muscle_gain" as const,
      level: "intermediate" as const,
    },
  };

  console.log("Case 1: Normal swap with barbell exercise\n");

  const result = await swapExerciseCore({
    resolveSwapWeights: fakeResolveSwapWeights,
    validateSwapTarget: async () => true, // Always allow for test
  }, input);

  // Check that result succeeded
  check(
    "Result succeeded (ok: true)",
    result.ok === true,
    `got ok=${result.ok}`,
  );
  
  if (!result.ok) {
    console.error("Result failed:", result.error);
    process.exit(1);
  }

  // S3: Must pass the NEW exercise id, not the old one
  check(
    "S3: passes NEW exercise id (not old)",
    capturedExerciseId === NEW_EXERCISE_ID,
    `got ${capturedExerciseId}, expected ${NEW_EXERCISE_ID}`,
  );

  // S1: Must return weightPrefill unchanged
  check(
    "S1: returns weightPrefill unchanged",
    result.weightPrefill === 42.5,
    `got ${result.weightPrefill}, expected 42.5`,
  );

  // S2: Must return workingWeightKg unchanged
  check(
    "S2: returns workingWeightKg unchanged",
    result.workingWeightKg === 100,
    `got ${result.workingWeightKg}, expected 100`,
  );

  // currentTargetReps: Must be passed through unchanged
  check(
    "currentTargetReps passed through unchanged",
    result.currentTargetReps === 10,
    `got ${result.currentTargetReps}, expected 10`,
  );

  // Also verify isBodyweight is computed correctly (not bodyweight for barbell)
  check(
    "isBodyweight false for barbell",
    result.isBodyweight === false,
    `got ${result.isBodyweight}`,
  );

  console.log("\nCase 2: Bodyweight exercise\n");

  capturedExerciseId = null;
  const bodyweightInput: SwapExerciseCoreInput = {
    ...input,
    replacement: {
      metric: "reps" as const,
      mechanic: "compound" as const,
      equipment_ids: [],
      movement_pattern: "vertical_pull" as const,
    },
  };

  const fakeBWResolveSwapWeights: SwapExerciseDeps["resolveSwapWeights"] = async (
    _,
    newExerciseId,
    equipmentIds,
  ) => {
    capturedExerciseId = newExerciseId;
    return {
      weightPrefill: null,
      workingWeightKg: null,
      currentTargetReps: null,
      isBodyweight: equipmentIds.length === 0,
    };
  };

  const bwResult = await swapExerciseCore({
    resolveSwapWeights: fakeBWResolveSwapWeights,
    validateSwapTarget: async () => true, // Always allow for test
  }, bodyweightInput);

  check(
    "Bodyweight result succeeded (ok: true)",
    bwResult.ok === true,
    `got ok=${bwResult.ok}`,
  );
  
  if (!bwResult.ok) {
    console.error("Bodyweight result failed:", bwResult.error);
    process.exit(1);
  }

  check(
    "S3: passes NEW exercise id for bodyweight",
    capturedExerciseId === NEW_EXERCISE_ID,
    `got ${capturedExerciseId}`,
  );

  check(
    "S1: returns null weightPrefill unchanged",
    bwResult.weightPrefill === null,
    `got ${bwResult.weightPrefill}`,
  );

  check(
    "S2: returns null workingWeightKg unchanged",
    bwResult.workingWeightKg === null,
    `got ${bwResult.workingWeightKg}`,
  );

  check(
    "isBodyweight true for bodyweight exercise",
    bwResult.isBodyweight === true,
    `got ${bwResult.isBodyweight}`,
  );

  console.log("\n✅ All swap-exercise-core tests passed");
  console.log("\nMutants covered:");
  console.log("  S3: passing OLD exercise id → FAILS S3 check");
  console.log("  S1: returning null weightPrefill → FAILS S1 check");
  console.log("  S2: returning null workingWeightKg → FAILS S2 check\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
