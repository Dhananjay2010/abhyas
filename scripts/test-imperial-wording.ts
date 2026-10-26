#!/usr/bin/env tsx
/**
 * Test: Progression messages use kg-only wording (M2)
 * 
 * M2: Imperial removed. All progression messages now use 'kg' regardless
 * of user preference. This verifies messages always say 'kg', never 'lb'.
 */

import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression";
import { progressionInputsFromExercise } from "../src/lib/session/progression-inputs";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `: ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const fresh = {
  currentWorkingWeightKg: 40,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 40,
  bestReps: 12,
  bestE1rm: 56,
  totalSessions: 3,
  weightAtFailureStartKg: null,
};

const success = Array.from({ length: 4 }, () => ({ reps: 12, weightKg: 40 }));

console.log("M2: All progression messages use 'kg' (imperial removed)");

console.log("\n1. Equipment exercises show kg");

const equipInputs = progressionInputsFromExercise({ equipment_ids: ["barbell"] });

const equipResult = evaluateProgression({
  sets: success,
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh,
  isDeload: false,
  ...equipInputs,
});

check("Equipment message contains 'kg'", equipResult.message.includes("kg"), `message: "${equipResult.message}"`);
check("Equipment message does NOT contain 'lb'", !equipResult.message.includes("lb"), `message: "${equipResult.message}"`);

console.log("\n2. First-miss drop shows kg");

const missResult = evaluateProgression({
  sets: Array.from({ length: 4 }, () => ({ reps: 7, weightKg: 40 })),
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh,
  isDeload: false,
  ...equipInputs,
});

check("First-miss message contains 'kg'", missResult.message.includes("kg"), `message: "${missResult.message}"`);
check("First-miss message does NOT contain 'lb'", !missResult.message.includes("lb"), `message: "${missResult.message}"`);

console.log("\n3. Two-miss back-off shows kg");

const twoMissResult = evaluateProgression({
  sets: Array.from({ length: 4 }, () => ({ reps: 7, weightKg: 37.5 })),
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: { ...fresh, currentWorkingWeightKg: 37.5, consecutiveFailures: 1, weightAtFailureStartKg: 40 },
  isDeload: false,
  ...equipInputs,
});

check("Two-miss message contains 'kg'", twoMissResult.message.includes("kg"), `message: "${twoMissResult.message}"`);
check("Two-miss message does NOT contain 'lb'", !twoMissResult.message.includes("lb"), `message: "${twoMissResult.message}"`);

console.log("\n4. No-equipment exercises can show weight when adding weight");

const noEquipInputs = progressionInputsFromExercise({ equipment_ids: [] });

const noEquipResult = evaluateProgression({
  sets: success,
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: { ...BENCH, isBodyweight: true },
  state: { ...fresh, currentWorkingWeightKg: null, bestWeightKg: null },
  isDeload: false,
  ...noEquipInputs,
});

check("No-equipment message exists", noEquipResult.message.length > 0, `message: "${noEquipResult.message}"`);
// Option A: bodyweight with added weight shows unit (kg) when naming the weight
if (noEquipResult.message.includes("kg")) {
  check("Bodyweight message uses kg (not lb)", !noEquipResult.message.includes("lb"), `message: "${noEquipResult.message}"`);
} else {
  check("Bodyweight message without weight does not mention unit", !noEquipResult.message.includes("lb"), `message: "${noEquipResult.message}"`);
}
console.log("\n5. Loaded exercise with null stored weight still shows kg target");

// A) Probe: dumbbell compound, 3×12 @40, state.currentWorkingWeightKg null, equipmentIds ['dumbbell']
const loadedNullState = evaluateProgression({
  sets: success,
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: { ...BENCH, mechanic: "compound" },
  state: { ...fresh, currentWorkingWeightKg: null, bestWeightKg: null },
  isDeload: false,
  ...equipInputs,
});

check("Loaded exercise with null stored weight shows kg target", loadedNullState.message.includes("up to 42.5 kg"), `message: "${loadedNullState.message}"`);

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED - All messages use kg (M2)");
  process.exit(0);
}
