#!/usr/bin/env tsx
/**
 * Test: Progression messages respect imperial units preference
 * 
 * Verifies that when units: "imperial", all progression messages show lb,
 * and no kg appears in any message.
 */

import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression";

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

console.log("Imperial progression messages");

console.log("\n1. Equipment exercises show lb");

const equipResult = evaluateProgression({
  sets: success,
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh,
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "lb",
});

check("Equipment message contains 'lb'", equipResult.message.includes("lb"), `message: "${equipResult.message}"`);
check("Equipment message does NOT contain 'kg'", !equipResult.message.includes("kg"), `message: "${equipResult.message}"`);

console.log("\n2. First-miss drop shows lb");

const missResult = evaluateProgression({
  sets: Array.from({ length: 4 }, () => ({ reps: 7, weightKg: 40 })),
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh,
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "lb",
});

check("First-miss message contains 'lb'", missResult.message.includes("lb"), `message: "${missResult.message}"`);
check("First-miss message does NOT contain 'kg'", !missResult.message.includes("kg"), `message: "${missResult.message}"`);

console.log("\n3. Two-miss back-off shows lb");

const twoMissResult = evaluateProgression({
  sets: Array.from({ length: 4 }, () => ({ reps: 7, weightKg: 37.5 })),
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: { ...fresh, currentWorkingWeightKg: 37.5, consecutiveFailures: 1, weightAtFailureStartKg: 40 },
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "lb",
});

check("Two-miss message contains 'lb'", twoMissResult.message.includes("lb"), `message: "${twoMissResult.message}"`);
check("Two-miss message does NOT contain 'kg'", !twoMissResult.message.includes("kg"), `message: "${twoMissResult.message}"`);

console.log("\n4. Third-miss step-down shows lb");

const thirdMissResult = evaluateProgression({
  sets: Array.from({ length: 3 }, () => ({ reps: 7, weightKg: 35 })),
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta: BENCH,
  state: { ...fresh, currentWorkingWeightKg: 35, consecutiveFailures: 2, weightAtFailureStartKg: 40 },
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "lb",
});

check("Third-miss message contains 'lb'", thirdMissResult.message.includes("lb"), `message: "${thirdMissResult.message}"`);
check("Third-miss message does NOT contain 'kg'", !thirdMissResult.message.includes("kg"), `message: "${thirdMissResult.message}"`);

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED - All imperial messages show lb");
  process.exit(0);
}
