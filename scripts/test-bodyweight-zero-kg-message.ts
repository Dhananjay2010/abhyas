#!/usr/bin/env tsx
/**
 * Test MEDIUM-1: Bodyweight exercises at 0 kg should say "Staying at this weight..."
 * not "Staying at 0 kg..." (metric) or "Staying at —..." (imperial)
 */

import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression";

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  FAIL ${label}${detail ? `: ${detail}` : ""}`);
    failures++;
  }
}

// Bodyweight exercise (e.g. weighted dips with 0 kg after two-miss back-to-bodyweight)
const bodyweightMeta: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "vertical_press",
  metric: "reps",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

// Test 1: Metric units, bodyweight miss at 0 kg
const metricDecision = evaluateProgression({
  sets: [
    { reps: 7, weightKg: 0, durationSeconds: null },
    { reps: 7, weightKg: 0, durationSeconds: null },
    { reps: 7, weightKg: 0, durationSeconds: null },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: bodyweightMeta,
  state: {
    currentWorkingWeightKg: 0,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 0,
    bestReps: 10,
    bestE1rm: null,
    totalSessions: 5,
  },
  isDeload: false,
  equipmentIds: [],
  unit: "kg",
});

check(
  "Metric: bodyweight miss at 0 kg says 'Staying at this weight...' not 'Staying at 0 kg...'",
  metricDecision.message.includes("Staying at this weight") && !metricDecision.message.includes("0 kg"),
  `got: ${metricDecision.message}`
);

// Test 2: Imperial units, bodyweight miss at 0 kg
const imperialDecision = evaluateProgression({
  sets: [
    { reps: 7, weightKg: 0, durationSeconds: null },
    { reps: 7, weightKg: 0, durationSeconds: null },
    { reps: 7, weightKg: 0, durationSeconds: null },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: bodyweightMeta,
  state: {
    currentWorkingWeightKg: 0,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 0,
    bestReps: 10,
    bestE1rm: null,
    totalSessions: 5,
  },
  isDeload: false,
  equipmentIds: [],
  unit: "lb",
});

check(
  "Imperial: bodyweight miss at 0 kg says 'Staying at this weight...' not 'Staying at —...'",
  imperialDecision.message.includes("Staying at this weight") && !imperialDecision.message.includes("—"),
  `got: ${imperialDecision.message}`
);

// Test 3 is covered by the first two tests (the primary case for MEDIUM-1)

if (failures > 0) {
  console.log(`\n❌ FAILED: ${failures} checks`);
  process.exit(1);
}

console.log("\n✅ ALL CHECKS PASSED");
process.exit(0);
