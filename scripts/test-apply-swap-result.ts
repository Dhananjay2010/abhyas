/**
 * Test applySwapResult (MEDIUM-1): ensures swap updates all required fields.
 * This tests the pure function extracted from session-runner.tsx.
 */

import { applySwapResult, type SessionExercise } from "@/lib/session/apply-swap";
import type { SwapResult } from "@/app/session/actions";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

console.log("\nTest applySwapResult (MEDIUM-1):\n");

const exercises: SessionExercise[] = [
  {
    id: "se1",
    exerciseId: "old-exercise-id",
    name: "Old Exercise",
    cue: null,
    metric: "reps",
    repsMin: 8,
    repsMax: 12,
    suggestedWeightKg: 50,
    workingWeightKg: 70,
    isBodyweight: false,
  },
  {
    id: "se2",
    exerciseId: "other-id",
    name: "Other Exercise",
    cue: null,
    metric: "reps",
    repsMin: 10,
    repsMax: 15,
    suggestedWeightKg: 30,
    workingWeightKg: 40,
    isBodyweight: false,
  },
];

// Test 1: Apply swap with prefill
const swapResult: SwapResult & { exerciseId: string; name: string; cue: string | null } = {
  exerciseId: "new-exercise-id",
  name: "New Exercise",
  cue: "Test cue",
  metric: "reps",
  repsMin: 6,
  repsMax: 10,
  equipmentIds: ["barbell"],
  weightPrefill: 24,
  workingWeightKg: 100,
  isBodyweight: false,
};

const result1 = applySwapResult(exercises, "se1", swapResult);
check("Returns new array", result1 !== exercises);
check("Updates correct exercise", result1[0].id === "se1");
check("Sets new exerciseId", result1[0].exerciseId === "new-exercise-id", "got new-exercise-id");
check("Sets new name", result1[0].name === "New Exercise");
check("Sets new cue", result1[0].cue === "Test cue");
check("Sets new metric", result1[0].metric === "reps");
check("Sets new reps", result1[0].repsMin === 6 && result1[0].repsMax === 10, "6-10");
check("Sets suggestedWeightKg from prefill", result1[0].suggestedWeightKg === 24, "got 24");
check("Sets workingWeightKg", result1[0].workingWeightKg === 100, "got 100");
check("Sets isBodyweight", result1[0].isBodyweight === false);
check("Other exercise unchanged", result1[1].exerciseId === "other-id");

// Test 2: Apply swap with null prefill
const swapResult2: SwapResult & { exerciseId: string; name: string; cue: string | null } = {
  exerciseId: "never-done-id",
  name: "Never Done",
  cue: null,
  metric: "reps",
  repsMin: 8,
  repsMax: 12,
  equipmentIds: [],
  weightPrefill: null,
  workingWeightKg: null,
  isBodyweight: true,
};

const result2 = applySwapResult(exercises, "se1", swapResult2);
check("Null prefill sets suggestedWeightKg to null", result2[0].suggestedWeightKg === null, "got null");
check("Null workingWeightKg", result2[0].workingWeightKg === null, "got null");
check("Sets isBodyweight true", result2[0].isBodyweight === true);

// Test 3: Apply swap to non-existent id does nothing
const result3 = applySwapResult(exercises, "non-existent", swapResult);
check("Non-existent id: no exercise changed", result3[0].exerciseId === "old-exercise-id" && result3[1].exerciseId === "other-id");

console.log("\n✅ All applySwapResult tests passed\n");
