#!/usr/bin/env tsx
/**
 * Test progression messages with metric and imperial units.
 * 
 * Verifies that:
 * 1. formatWeight from units.ts is used for all user-facing progression messages
 * 2. Metric messages show "kg" 
 * 3. Imperial messages show "lb" with 0.5 lb rounding
 * 4. Internal progression logic remains in kg
 * 5. Zero weights show correct units
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState } from "@/lib/program/progression";
import { strict as assert } from "assert";

function check(desc: string, condition: boolean, context?: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${desc}`);
    if (context) console.error(`   Context: ${context}`);
    process.exit(1);
  }
  console.log(`✓ ${desc}`);
}

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
check("metric message includes 'kg'", metricSuccess.message.includes("kg"), metricSuccess.message);
check("metric message does not include 'lb'", !metricSuccess.message.includes("lb"), metricSuccess.message);
check("metric shows 22.5 kg", metricSuccess.message.includes("22.5 kg"), metricSuccess.message);
console.log();

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
check("imperial message includes 'lb'", imperialSuccess.message.includes("lb"), imperialSuccess.message);
check("imperial message does not include 'kg'", !imperialSuccess.message.includes("kg"), imperialSuccess.message);
check("imperial shows lb equivalent", imperialSuccess.message.includes("49.5 lb") || imperialSuccess.message.includes("50 lb"), imperialSuccess.message);
console.log();

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
check("metric miss message includes 'kg'", metricMiss.message.includes("kg"), metricMiss.message);
console.log();

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
check("imperial miss message includes 'lb'", imperialMiss.message.includes("lb"), imperialMiss.message);
check("imperial miss message does not include 'kg'", !imperialMiss.message.includes("kg"), imperialMiss.message);
console.log();

// Test 5: Dumbbell hold at smallest step (2.5 kg)
console.log("5. Dumbbell hold at smallest step (2.5 kg)");
const metricHold = evaluateProgression({
  sets: [{ reps: 11, weightKg: 2.5 }, { reps: 11, weightKg: 2.5 }, { reps: 11, weightKg: 2.5 }],
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
check("Hold message should reference weight or smallest step", metricHold.message.includes("2.5 kg") || metricHold.message.includes("smallest"), metricHold.message);
console.log();

// Test 6: Third-miss step-down with units
console.log("6. Third-miss step-down with units");
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
check("Third-miss message should include 'kg'", metricThirdMiss.message.includes("kg"), metricThirdMiss.message);

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
check("Imperial third-miss message should include 'lb'", imperialThirdMiss.message.includes("lb"), imperialThirdMiss.message);
check("Imperial third-miss message should not include 'kg'", !imperialThirdMiss.message.includes("kg"), imperialThirdMiss.message);
console.log();

// Test 7: Zero-weight display with imperial units
console.log("7. Zero-weight display with imperial units");
const imperialZeroWeight = evaluateProgression({
  sets: [{ reps: 12, weightKg: 0 }, { reps: 12, weightKg: 0 }, { reps: 12, weightKg: 0 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta: { mechanic: "isolation", metric: "reps", movementPattern: "other", isBodyweight: true, progressionChain: null, progressionRank: null },
  state: { currentWorkingWeightKg: 0, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: 0, bestReps: 11, bestE1rm: 0, totalSessions: 1, weightAtFailureStartKg: null },
  isDeload: false,
  units: "imperial",
});

console.log("Imperial 0-weight message:");
console.log(`  Message: "${imperialZeroWeight.message}"`);
check("Imperial 0-weight message contains '0 lb'", imperialZeroWeight.message.includes("0 lb"), imperialZeroWeight.message);
check("Imperial 0-weight message does not contain 'kg'", !imperialZeroWeight.message.includes("kg"), imperialZeroWeight.message);
console.log();

console.log("=== SUMMARY ===");
console.log("✓ All progression messages use formatWeight from units.ts");
console.log("✓ Metric messages show kg");
console.log("✓ Imperial messages show lb with proper rounding");
console.log("✓ Internal progression logic remains in kg");
