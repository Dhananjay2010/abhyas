#!/usr/bin/env tsx
/**
 * Test: Never-raise hold preserves consecutiveFailures (H2 mutant killer)
 * 
 * When a two-miss back-off would raise the weight (reduced > current),
 * the code holds at current and must preserve consecutiveFailures and
 * weightAtFailureStartKg so the third miss can step down.
 * 
 * H2 mutant: sets consecutiveFailures to 0 on this hold (wrong).
 */

import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `: ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

const meta: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("Never-raise hold preserves counter and weightAtFailureStartKg");

// Scenario: at very light weight (5 kg), second miss.
// The 10% back-off would go to 4.5 kg, but with 2.5 kg grid step,
// the smallest loadable >= 4.05 is 5 kg, so reduced === current.
// Since reduced > current would be false, we might hit the never-raise hold.
// Actually, let me construct a case where reduced > current.

// Better scenario: equipment that forces holding at current when the grid
// makes it impossible to back off without going below target.

// Simpler: at kettlebell 8 kg, second miss. Target is 7.2 kg.
// Available bells: ..., 6, 8, 10, ...
// 6 < 7.2, so SMALLEST >= 7.2 and < 8 doesn't exist.
// reduced === current (8), not > current.

// Let me try another angle: With a custom grid that has gaps, I can make
// reduced come out > current due to rounding.

// Actually, from the code at lines 928-937, "Never raise" happens when
// reduced > currentWeight. This can occur if the equipment grid forces
// an upward snap.

// Construct a scenario:
// currentWeight = 10 kg
// weightAtFailureStart = 12.5 kg
// 90% of 12.5 = 11.25 kg
// With barbell (2.5 kg step), smallest loadable >= 11.25 and < 10 is... none.
// So reduced = 10 (hold).
// No, that's reduced === current, not reduced > current.

// To get reduced > current, I need the grid to force the result above current.
// Example:
// - currentWeight = 10 kg
// - wafs = 15 kg (somehow we dropped from 15 to 10 already)
// - 90% of 15 = 13.5 kg
// - Grid snaps to 12.5 kg or higher
// - If the only loadable >= 13.5 and < 15 is... wait, we need < current (10).

// Hmm, this is tricky. Let me look at the code more carefully.

// From line 810-841, computeTwoMissResult finds SMALLEST loadable >= target and < weight.
// For reduced > current to happen, the helper would need to return something > current.
// But it's called with weightToBackOffFrom (wafs or current), not current.

// If wafs = 15 and current = 10, and we call computeTwoMissResult(15),
// it finds smallest >= 13.5 and < 15, which might be 15 itself (if no loadable in that range),
// meaning reduced = 15.
// Then reduced (15) > current (10) is true.

// But wait, the helper returns weight if no loadable is found in range, so reduced = 15.
// Then line 928 checks if reduced > current, which is 15 > 10 = true.

console.log("\nScenario: wafs = 15 kg, current = 10 kg, second miss");
console.log("The back-off helper returns 15 kg (no lighter loadable in range),");
console.log("so reduced > current triggers the never-raise hold.");

const result = evaluateProgression({
  sets: [{ reps: 7, weightKg: 10 }, { reps: 7, weightKg: 10 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 10,
    currentTargetReps: 12,
    consecutiveFailures: 1,
    bestWeightKg: 15,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 5,
    weightAtFailureStartKg: 15,
  },
  isDeload: false,
  equipmentIds: ["barbell"],
  units: "metric",
});

console.log(`  Message: "${result.message}"`);
console.log(`  Next weight: ${result.nextWorkingWeightKg} kg`);
console.log(`  Consecutive failures: ${result.consecutiveFailures}`);
console.log(`  Weight at failure start: ${result.weightAtFailureStartKg} kg`);

check("Holds at current weight", result.nextWorkingWeightKg === 10, `got: ${result.nextWorkingWeightKg}`);
check("Preserves consecutiveFailures at 2", result.consecutiveFailures === 2, `got: ${result.consecutiveFailures}`);
check("Preserves weightAtFailureStartKg at 15", result.weightAtFailureStartKg === 15, `got: ${result.weightAtFailureStartKg}`);
check("Message says 'no lighter loadable weight'", result.message.includes("no lighter loadable weight"), result.message);

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  console.log("The never-raise hold does not preserve state correctly (H2 mutant survives)");
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED - Never-raise hold preserves counter and wafs");
  console.log("Kills mutant: H2");
  process.exit(0);
}
