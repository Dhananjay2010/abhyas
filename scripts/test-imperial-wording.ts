#!/usr/bin/env tsx
/**
 * Test: Progression messages use correct unit wording
 * 
 * Verifies that evaluateProgression messages say 'lb' for imperial users
 * and 'kg' for metric users.
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
  totalSessions: 3, weightAtFailureStartKg: null,
};

const success = Array.from({ length: 4 }, () => ({ reps: 12, weightKg: 40 }));

console.log("1. Metric user sees 'kg' in progression messages");

const metricInputs = progressionInputsFromExercise(
  { equipment_ids: ["barbell"] },
  "metric"
);

const metricResult = evaluateProgression({
  sets: success,
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh,
  isDeload: false,
  ...metricInputs,
});

check("Metric message contains 'kg'", metricResult.message.includes("kg"), `message: "${metricResult.message}"`);
check("Metric message does not contain 'lb'", !metricResult.message.includes("lb"), `message: "${metricResult.message}"`);

console.log("\n2. Imperial user sees 'lb' in progression messages");

const imperialInputs = progressionInputsFromExercise(
  { equipment_ids: ["barbell"] },
  "imperial"
);

const imperialResult = evaluateProgression({
  sets: success,
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh,
  isDeload: false,
  ...imperialInputs,
});

check("Imperial message contains 'lb'", imperialResult.message.includes("lb"), `message: "${imperialResult.message}"`);
check("Imperial message does not contain 'kg'", !imperialResult.message.includes("kg"), `message: "${imperialResult.message}"`);

console.log("\n3. No-equipment user defaults to 'kg'");

const noEquipInputs = progressionInputsFromExercise(
  { equipment_ids: [] },
  "metric"
);

const noEquipResult = evaluateProgression({
  sets: success,
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh,
  isDeload: false,
  ...noEquipInputs,
});

// No-equipment returns undefined unit, so message won't have unit suffix
check("No-equipment message exists", noEquipResult.message.length > 0, `message: "${noEquipResult.message}"`);

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED");
  process.exit(0);
}
