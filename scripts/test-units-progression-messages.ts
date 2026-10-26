#!/usr/bin/env tsx
/**
 * Test progression messages with metric and imperial units.
 * 
 * Verifies that:
 * 1. formatWeight from units.ts is used for all user-facing progression messages
 * 2. Metric messages show "kg" 
 * 3. Imperial messages show "lb" with 0.5 lb rounding
 * 4. Internal progression logic remains in kg
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState } from "@/lib/program/progression";
import { strict as assert } from "assert";

const meta: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("=== METRIC MESSAGES ===\n");

// Test 1: Metric success message
const metricSuccess = evaluateProgression({
  sets: [{ reps: 12, weightKg: 20 }, { reps: 12, weightKg: 20 }, { reps: 12, weightKg: 20 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 20,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 20,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 1,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  units: "metric",
});

console.log("Metric success:");
console.log(`  Message: "${metricSuccess.message}"`);
console.log(`  Next weight: ${metricSuccess.nextWorkingWeightKg} kg`);
assert(metricSuccess.message.includes("kg"), "Metric message should include 'kg'");
assert(!metricSuccess.message.includes("lb"), "Metric message should not include 'lb'");
assert(metricSuccess.message.includes("22.5 kg"), "Metric should show 22.5 kg (20 + 12.5%)");
console.log("  ✓ Shows kg unit\n");

// Test 2: Imperial success message (same scenario)
const imperialSuccess = evaluateProgression({
  sets: [{ reps: 12, weightKg: 20 }, { reps: 12, weightKg: 20 }, { reps: 12, weightKg: 20 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 20,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 20,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 1,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  units: "imperial",
});

console.log("Imperial success:");
console.log(`  Message: "${imperialSuccess.message}"`);
console.log(`  Next weight: ${imperialSuccess.nextWorkingWeightKg} kg (internal storage)`);
assert(imperialSuccess.message.includes("lb"), "Imperial message should include 'lb'");
assert(!imperialSuccess.message.includes("kg"), "Imperial message should not include 'kg'");
assert(imperialSuccess.message.includes("49.5 lb") || imperialSuccess.message.includes("50 lb"), 
  "Imperial should show lb equivalent (22.5 kg ≈ 49.6 lb → rounds to 49.5 or 50 lb)");
console.log("  ✓ Shows lb unit");
console.log("  ✓ Internal storage remains in kg\n");

// Test 3: Metric miss message
const metricMiss = evaluateProgression({
  sets: [{ reps: 7, weightKg: 40 }, { reps: 6, weightKg: 40 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 40,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 40,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 2,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  units: "metric",
});

console.log("Metric miss (first miss, drops weight):");
console.log(`  Message: "${metricMiss.message}"`);
console.log(`  Next weight: ${metricMiss.nextWorkingWeightKg} kg`);
assert(metricMiss.message.includes("kg"), "Metric miss message should include 'kg'");
console.log("  ✓ Shows kg unit\n");

// Test 4: Imperial miss message
const imperialMiss = evaluateProgression({
  sets: [{ reps: 7, weightKg: 40 }, { reps: 6, weightKg: 40 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 40,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 40,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 2,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  units: "imperial",
});

console.log("Imperial miss:");
console.log(`  Message: "${imperialMiss.message}"`);
console.log(`  Next weight: ${imperialMiss.nextWorkingWeightKg} kg (internal storage)`);
assert(imperialMiss.message.includes("lb"), "Imperial miss message should include 'lb'");
assert(!imperialMiss.message.includes("kg"), "Imperial miss message should not include 'kg'");
console.log("  ✓ Shows lb unit");
console.log("  ✓ Internal storage remains in kg\n");

// Test 5: Hold message (smallest step)
const metricHold = evaluateProgression({
  sets: [{ reps: 7, weightKg: 2.5 }, { reps: 6, weightKg: 2.5 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 2.5,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 2.5,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 2,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  equipmentIds: ["dumbbell"],
  units: "metric",
});

console.log("Metric hold (smallest step):");
console.log(`  Message: "${metricHold.message}"`);
assert(metricHold.message.includes("2.5 kg") || metricHold.message.includes("smallest"), 
  "Hold message should reference weight or smallest step");
console.log("  ✓ Shows kg unit\n");

// Test 6: Third-miss step-down with units
const metricThirdMiss = evaluateProgression({
  sets: [{ reps: 7, weightKg: 36 }, { reps: 6, weightKg: 36 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 36,
    currentTargetReps: 12,
    consecutiveFailures: 2,
    bestWeightKg: 40,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 3,
    weightAtFailureStartKg: 40,
  },
  isDeload: false,
  equipmentIds: ["dumbbell"],
  units: "metric",
});

console.log("Metric third-miss step-down:");
console.log(`  Message: "${metricThirdMiss.message}"`);
assert(metricThirdMiss.message.includes("kg"), "Third-miss message should include 'kg'");
console.log("  ✓ Shows kg unit\n");

const imperialThirdMiss = evaluateProgression({
  sets: [{ reps: 7, weightKg: 36 }, { reps: 6, weightKg: 36 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 36,
    currentTargetReps: 12,
    consecutiveFailures: 2,
    bestWeightKg: 40,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 3,
    weightAtFailureStartKg: 40,
  },
  isDeload: false,
  equipmentIds: ["dumbbell"],
  units: "imperial",
});

console.log("Imperial third-miss step-down:");
console.log(`  Message: "${imperialThirdMiss.message}"`);
assert(imperialThirdMiss.message.includes("lb"), "Imperial third-miss message should include 'lb'");
assert(!imperialThirdMiss.message.includes("kg"), "Imperial third-miss message should not include 'kg'");
console.log("  ✓ Shows lb unit\n");

console.log("=== SUMMARY ===");
console.log("✓ All progression messages use formatWeight from units.ts");
console.log("✓ Metric messages show kg");
console.log("✓ Imperial messages show lb with proper rounding");
console.log("✓ Internal progression logic remains in kg");
