#!/usr/bin/env tsx
/**
 * SW2 mechanic wiring test: Verifies that mechanic is correctly passed from
 * replacement exercise to resolveSwapWeights in swap-exercise-core.
 * 
 * Kills mutant SW2 (mechanic dropped from resolveSwapWeights call).
 */

import { swapExerciseCore, type SwapExerciseDeps, type SwapExerciseCoreInput } from "@/lib/session/swap-exercise-core";

console.log("Testing SW2 mechanic wiring in swap-exercise-core...\n");

let capturedMechanic: string | null | undefined = undefined;

// Mock dependencies
const mockDeps: SwapExerciseDeps = {
  async resolveSwapWeights(sessionId, newExerciseId, equipmentIds, mechanic, metric, movementPattern, remembersWeights) {
    // Capture the mechanic argument
    capturedMechanic = mechanic;
    console.log(`✓ resolveSwapWeights called with mechanic: ${mechanic ?? "null"}`);
    
    return {
      weightPrefill: 20,
      workingWeightKg: 20,
      currentTargetReps: 12,
      isBodyweight: false,
    };
  },
  
  async validateSwapTarget({ newExerciseId, sessionExerciseId }) {
    // Always approve the swap
    return true;
  },
};

// Test input with isolation mechanic
const testInput: SwapExerciseCoreInput = {
  newExerciseId: "new-exercise-id",
  sessionExerciseId: "session-exercise-id",
  current: {
    exercise_id: "old-exercise-id",
    metric: "reps",
    planned_reps_min: 8,
    planned_reps_max: 12,
    session_id: "test-session-id",
  },
  replacement: {
    metric: "reps",
    mechanic: "isolation", // This is the key field being tested
    equipment_ids: ["dumbbell"],
    movement_pattern: "horizontal_press",
  },
  profile: {
    goal: "muscle_gain" as const,
    level: "intermediate" as const,
  },
  remembersWeights: true,
};

async function runTest() {
  // Call swapExerciseCore
  const result = await swapExerciseCore(mockDeps, testInput);

  console.log("\nSwap result:");
  console.log(`  ok: ${result.ok}`);

  if (!result.ok) {
    console.error("❌ FAIL: Swap failed unexpectedly");
    console.error(`  Error: ${result.error}`);
    return false;
  }

  console.log(`  weightPrefill: ${result.weightPrefill}`);
  console.log(`  currentTargetReps: ${result.currentTargetReps}\n`);

  // Verify mechanic was passed correctly
  if (capturedMechanic === undefined) {
    console.error("❌ FAIL: resolveSwapWeights was not called");
    console.error("  This should not happen!");
    return false;
  }

  if (capturedMechanic !== "isolation") {
    console.error("❌ FAIL: mechanic not passed correctly to resolveSwapWeights");
    console.error(`  Expected: "isolation", Got: ${capturedMechanic ?? "null"}`);
    console.error("  This means mutant SW2 is alive!");
    return false;
  }

  console.log("✓ Mechanic correctly passed to resolveSwapWeights: isolation");
  console.log("✓ SW2 mechanic wiring test passed - mutant SW2 is killed\n");
  return true;
}

runTest().then((passed) => {
  process.exit(passed ? 0 : 1);
});
