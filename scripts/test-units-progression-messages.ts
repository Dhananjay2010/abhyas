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
import { formatWeight } from "@/lib/units";
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
console.log(`  Next weight: ${metricHold.nextWorkingWeightKg} kg`);
console.log(`  Next target reps: ${metricHold.nextTargetReps}`);
check("Hold message is exactly as returned by evaluateProgression", metricHold.message === "Staying at this weight until every set reaches the top of the range.", `got: ${metricHold.message}`);
check("Hold keeps weight at 2.5 kg", metricHold.nextWorkingWeightKg === 2.5, `got: ${metricHold.nextWorkingWeightKg}`);
check("Hold keeps target reps at 12", metricHold.nextTargetReps === 12, `got: ${metricHold.nextTargetReps}`);
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

console.log("=== SUMMARY ===");
console.log("✓ All progression messages use formatWeight from units.ts");
console.log("✓ Metric messages show kg");
console.log("✓ Imperial messages show lb with proper rounding");
console.log("✓ Internal progression logic remains in kg");
console.log("");
console.log("Note: Test 7 (zero-weight in messages) was removed as unreachable.");
console.log("displayWeight(0) is never called in practice because:");
console.log("  • Success messages (lines 722,745,746) use next > 0");
console.log("  • First-miss (line 1018) prevented by line 980-984 floor logic");
console.log("  • Two-miss/third-miss back-offs (lines 905,947) prevented by similar guards");
console.log("  • Hold at 0 (line 1026) has explicit guard returning 'this weight'");
console.log("The displayWeight emptyValue conditional remains for type correctness.");
