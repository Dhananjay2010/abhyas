#!/usr/bin/env tsx
/**
 * Test: M1 NULL pre-miss weight fallback
 * 
 * When weight_at_failure_start_kg is NULL (legacy/in-flight row),
 * two-miss back-off falls back to currentWeight as the base.
 * Still snaps DOWN and never exceeds currentWeight.
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

const missingSets = Array.from({ length: 4 }, () => ({ reps: 7, weightKg: 37.5 }));

console.log("M1: NULL pre-miss weight fallback");
console.log("\nScenario: mid-failure row before migration (weight_at_failure_start_kg = NULL)");
console.log("Current weight: 37.5 kg (already dropped once)");
console.log("consecutiveFailures: 1 (about to become 2)");
console.log("Expected: back off 10% from 37.5 kg (fallback to current), snap DOWN\n");

const result = evaluateProgression({
  sets: missingSets,
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: {
    currentWorkingWeightKg: 37.5,
    currentTargetReps: 12,
    consecutiveFailures: 1,
    bestWeightKg: 40,
    bestReps: 12,
    bestE1rm: 56,
    totalSessions: 5,
    weightAtFailureStartKg: null, // <-- NULL: legacy/in-flight
  },
  isDeload: false,
  equipmentIds: ["barbell"],
});

// 37.5 * 0.9 = 33.75 → Math.floor(33.75 / 2.5) * 2.5 = Math.floor(13.5) * 2.5 = 13 * 2.5 = 32.5 kg
const expected = 32.5;
const actual = result.nextWorkingWeightKg ?? 0;

check("NULL pre-miss: backs off from current weight", actual === expected, `got ${actual}, expected ${expected}`);
check("NULL pre-miss: snaps DOWN to grid", actual <= 33.75, `33.75 rounded down to ${actual}`);
check("NULL pre-miss: never exceeds current", actual <= 37.5, `${actual} <= 37.5`);
check("NULL pre-miss: outcome is BACKED_OFF", result.outcome === "backed_off", `outcome: ${result.outcome}`);
check("NULL pre-miss: consecutiveFailures resets", result.consecutiveFailures === 0, `consecutiveFailures: ${result.consecutiveFailures}`);
check("NULL pre-miss: message mentions kg", result.message.includes("kg"), `message: "${result.message}"`);
check("NULL pre-miss: weightAtFailureStartKg resets to null", result.weightAtFailureStartKg === null, `weightAtFailureStartKg: ${result.weightAtFailureStartKg}`);
console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED - NULL pre-miss weight fallback works");
  process.exit(0);
}
