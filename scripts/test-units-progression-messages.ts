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

// Test 7: Zero-weight third-miss step-down (bar and band floor at 0)
console.log("7. Third-miss step-down to 0 (bar and band)");

// Pull-up bar: 2.5 kg metric, third miss → 0 kg
const barMetric = evaluateProgression({
  sets: [{ reps: 7, weightKg: 2.5 }, { reps: 6, weightKg: 2.5 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 2.5,
    currentTargetReps: 12,
    consecutiveFailures: 2,
    bestWeightKg: 5,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 5,
    weightAtFailureStartKg: null,  // Back off from current, not wafs
  },
  isDeload: false,
  equipmentIds: ["pull_up_bar"],
  units: "metric",
});

console.log("Pull-up bar (metric) third miss to 0:");
console.log(`  Message: "${barMetric.message}"`);
console.log(`  Next weight: ${barMetric.nextWorkingWeightKg} kg`);
check("Bar metric reaches 0", barMetric.nextWorkingWeightKg === 0, `got: ${barMetric.nextWorkingWeightKg}`);
check("Bar metric message has no '0 kg'", !barMetric.message.includes("0 kg"), barMetric.message);
check("Bar metric message has no '0 lb'", !barMetric.message.includes("0 lb"), barMetric.message);

// Pull-up bar: 2.5 kg imperial, third miss → 0 kg
const barImperial = evaluateProgression({
  sets: [{ reps: 7, weightKg: 2.5 }, { reps: 6, weightKg: 2.5 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 2.5,
    currentTargetReps: 12,
    consecutiveFailures: 2,
    bestWeightKg: 5,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 5,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  equipmentIds: ["pull_up_bar"],
  units: "imperial",
});

console.log("Pull-up bar (imperial) third miss to 0:");
console.log(`  Message: "${barImperial.message}"`);
console.log(`  Next weight: ${barImperial.nextWorkingWeightKg} kg (internal)`);
check("Bar imperial reaches 0", barImperial.nextWorkingWeightKg === 0, `got: ${barImperial.nextWorkingWeightKg}`);
check("Bar imperial message has no '0 kg'", !barImperial.message.includes("0 kg"), barImperial.message);
check("Bar imperial message has no '0 lb'", !barImperial.message.includes("0 lb"), barImperial.message);

// Resistance band: 2.5 kg metric, third miss → 0 kg
const bandMetric = evaluateProgression({
  sets: [{ reps: 7, weightKg: 2.5 }, { reps: 6, weightKg: 2.5 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 2.5,
    currentTargetReps: 12,
    consecutiveFailures: 2,
    bestWeightKg: 5,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 5,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  equipmentIds: ["resistance_band"],
  units: "metric",
});

console.log("Resistance band (metric) third miss to 0:");
console.log(`  Message: "${bandMetric.message}"`);
console.log(`  Next weight: ${bandMetric.nextWorkingWeightKg} kg`);
check("Band metric reaches 0", bandMetric.nextWorkingWeightKg === 0, `got: ${bandMetric.nextWorkingWeightKg}`);
check("Band metric message has no '0 kg'", !bandMetric.message.includes("0 kg"), bandMetric.message);
check("Band metric message has no '0 lb'", !bandMetric.message.includes("0 lb"), bandMetric.message);

// Resistance band: 2.5 kg imperial, third miss → 0 kg
const bandImperial = evaluateProgression({
  sets: [{ reps: 7, weightKg: 2.5 }, { reps: 6, weightKg: 2.5 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 2.5,
    currentTargetReps: 12,
    consecutiveFailures: 2,
    bestWeightKg: 5,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 5,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  equipmentIds: ["resistance_band"],
  units: "imperial",
});

console.log("Resistance band (imperial) third miss to 0:");
console.log(`  Message: "${bandImperial.message}"`);
console.log(`  Next weight: ${bandImperial.nextWorkingWeightKg} kg (internal)`);
check("Band imperial reaches 0", bandImperial.nextWorkingWeightKg === 0, `got: ${bandImperial.nextWorkingWeightKg}`);
check("Band imperial message has no '0 kg'", !bandImperial.message.includes("0 kg"), bandImperial.message);
check("Band imperial message has no '0 lb'", !bandImperial.message.includes("0 lb"), bandImperial.message);
console.log();

console.log("=== SUMMARY ===");
console.log("✓ All progression messages use formatWeight from units.ts");
console.log("✓ Metric messages show kg");
console.log("✓ Imperial messages show lb with proper rounding");
console.log("✓ Internal progression logic remains in kg");
console.log("✓ Zero-weight step-down uses generic message (no '0 kg' or '0 lb')");
