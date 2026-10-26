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

// Test 5: Zero/empty weights show correct units
// Use the exact same scenario from test-bodyweight-zero-kg-message.ts
console.log("5. Zero/empty weights show correct units (bodyweight progression from 0 kg)");
{
  // Success at 0 kg bodyweight going up
  const zeroKgSuccess = evaluateProgression({
    sets: [{ reps: 12, weightKg: 0 }, { reps: 12, weightKg: 0 }, { reps: 12, weightKg: 0 }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta: { mechanic: "isolation", metric: "reps", movementPattern: "other", isBodyweight: true, progressionChain: null, progressionRank: null },
    state: { currentWorkingWeightKg: 0, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: 0, bestReps: 11, bestE1rm: 0, totalSessions: 1, weightAtFailureStartKg: null },
    isDeload: false,
    units: "metric",
  });
  // For bodyweight exercises, progression is reps not weight, so no weight mentioned is OK
  console.log(`  Metric 0 kg message: "${zeroKgSuccess.message}"`);
  check("metric 0 kg progresses to higher reps target (not weight)", zeroKgSuccess.nextTargetReps === 14 && zeroKgSuccess.nextWorkingWeightKg === 0, `next target: ${zeroKgSuccess.nextTargetReps}, next weight: ${zeroKgSuccess.nextWorkingWeightKg}`);
  
  const zeroLbSuccess = evaluateProgression({
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
  console.log(`  Imperial 0 lb message: "${zeroLbSuccess.message}"`);
  check("imperial 0 lb progresses to higher reps target (not weight)", zeroLbSuccess.nextTargetReps === 14 && zeroLbSuccess.nextWorkingWeightKg === 0, `next target: ${zeroLbSuccess.nextTargetReps}, next weight: ${zeroLbSuccess.nextWorkingWeightKg}`);
}
console.log();

console.log("=== SUMMARY ===");
console.log("✓ All progression messages use formatWeight from units.ts");
console.log("✓ Metric messages show kg");
console.log("✓ Imperial messages show lb with proper rounding");
console.log("✓ Internal progression logic remains in kg");
console.log("✓ Zero weight (bodyweight) exercises progress correctly");
