#!/usr/bin/env tsx
/**
 * Test: Two-miss hold preserves weightAtFailureStartKg (H6 mutant killer)
 * 
 * When a two-miss back-off returns the same weight (reduced === current),
 * it's a hold. The code must preserve weightAtFailureStartKg so that
 * the third miss can use it for the step-down logic.
 * 
 * H6 mutant: sets weightAtFailureStartKg to null on this hold (wrong).
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

console.log("Two-miss hold preserves weightAtFailureStartKg");

// Scenario: at barbell 5 kg, second miss.
// wafs = 7.5 kg, current = 5 kg
// 90% of 7.5 = 6.75 kg
// Smallest loadable >= 6.75 and < 7.5 with 2.5 kg steps is 7.5 kg (floor at 2.5).
// But we want < 7.5, so no candidate. Helper returns 7.5 kg.
// Actually wait, that's not how it works.

// Let me check: at 5 kg with wafs 7.5 kg, the helper looks for smallest >= 6.75 and < 7.5.
// Available: 2.5, 5, 7.5, 10, ...
// None satisfy >= 6.75 and < 7.5, so it returns current (5 kg) as hold.
// So reduced = 5, reduced === current, which is a hold at line 911.

// Actually, let's check the helper logic. From line 810-841:
// "find SMALLEST loadable >= target and < weight"
// If none found, returns weight (the input weight parameter).

// So if I call computeTwoMissResult(7.5):
// - target = 6.75 kg (90% of 7.5, snapped)
// - weight = 7.5 kg
// - Looking for >= 6.75 and < 7.5
// - 7.5 doesn't qualify (not < 7.5)
// - 5 doesn't qualify (< 6.75)
// - Returns 7.5 (hold at input weight)

// But in the main flow, we're at current = 5, so if reduced = 7.5, then reduced > current.
// That triggers the never-raise hold.

// Let me try: current = 7.5, wafs = 10
// 90% of 10 = 9 kg, snap to 7.5 or 10
// With 2.5 steps: 7.5, 10, 12.5, ...
// Smallest >= 9 and < 10 is... none (7.5 < 9, 10 not < 10)
// So reduced = 10 (hold at input)
// But 10 > 7.5, so never-raise hold.

// To get reduced === current, I need the helper to return current.
// This happens when there's no loadable in the target range.

// Example: current = 7.5, wafs = 10, but we want the helper to return 7.5.
// If the helper is called with current (7.5) instead of wafs:
// - target = 6.75 kg
// - Looking for >= 6.75 and < 7.5
// - None exist (5 < 6.75, 7.5 not < 7.5)
// - Returns 7.5

// But the code calls computeTwoMissResult(weightToBackOffFrom), which is wafs if available.

// Hmm, let me look for a simpler case. When does reduced === current?
// From the code, when no loadable weight fits in the back-off range and the helper
// gives up and returns the input weight. If input weight === current, then reduced === current.

// But the input is wafs if available, else current.
// So if wafs is set, input !== current (unless wafs === current, which is weird).

// OK, simpler: what if wafs is null and current = 5 kg?
// Then weightToBackOffFrom = 5 kg.
// 90% of 5 = 4.5, snap to 2.5 or 5.
// Target >= 3.25 (if we cap it).
// Wait, the logic in the helper is complex.

// Let me just construct a case where I know reduced === current from the QA report:
// "Band at 2.5 kg holds" on second miss.

console.log("\nScenario: resistance band at 2.5 kg, second miss");
console.log("No lighter loadable weight fits within 10%, so it holds.");

const result = evaluateProgression({
  sets: [{ reps: 7, weightKg: 2.5 }, { reps: 7, weightKg: 2.5 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 2.5,
    currentTargetReps: 12,
    consecutiveFailures: 1,
    bestWeightKg: 5,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 3,
    weightAtFailureStartKg: 5,
  },
  isDeload: false,
  equipmentIds: ["resistance_band"],
  units: "metric",
});

console.log(`  Message: "${result.message}"`);
console.log(`  Next weight: ${result.nextWorkingWeightKg} kg`);
console.log(`  Consecutive failures: ${result.consecutiveFailures}`);
console.log(`  Weight at failure start: ${result.weightAtFailureStartKg} kg`);

check("Holds at current weight", result.nextWorkingWeightKg === 2.5, `got: ${result.nextWorkingWeightKg}`);
check("Increments consecutiveFailures to 2", result.consecutiveFailures === 2, `got: ${result.consecutiveFailures}`);
check("Preserves weightAtFailureStartKg at 5", result.weightAtFailureStartKg === 5, `got: ${result.weightAtFailureStartKg}`);
check("Message says 'no lighter loadable weight'", result.message.includes("no lighter loadable weight"), result.message);

console.log("\nScenario 2: resistance band at 2.5 kg, second miss, wafs = 2.5");
console.log("This specifically triggers the reduced === currentWeight hold with holdMessage (H6 killer).");

const result2 = evaluateProgression({
  sets: [{ reps: 7, weightKg: 2.5 }, { reps: 7, weightKg: 2.5 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 2.5,
    currentTargetReps: 12,
    consecutiveFailures: 1,
    bestWeightKg: 5,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 3,
    weightAtFailureStartKg: 2.5,
  },
  isDeload: false,
  equipmentIds: ["resistance_band"],
  units: "metric",
});

console.log(`  Message: "${result2.message}"`);
console.log(`  Next weight: ${result2.nextWorkingWeightKg} kg`);
console.log(`  Consecutive failures: ${result2.consecutiveFailures}`);
console.log(`  Weight at failure start: ${result2.weightAtFailureStartKg} kg`);

check("Scenario 2: Holds at 2.5", result2.nextWorkingWeightKg === 2.5, `got: ${result2.nextWorkingWeightKg}`);
check("Scenario 2: cf=2", result2.consecutiveFailures === 2, `got: ${result2.consecutiveFailures}`);
check("Scenario 2: Preserves wafs at 2.5", result2.weightAtFailureStartKg === 2.5, `got: ${result2.weightAtFailureStartKg}`);
check("Scenario 2: outcome is hold", result2.outcome === "hold", `got: ${result2.outcome}`);

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  console.log("The two-miss hold does not preserve weightAtFailureStartKg (H6 mutant survives)");
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED - Two-miss hold preserves weightAtFailureStartKg");
  console.log("Kills mutant: H6");
  process.exit(0);
}
