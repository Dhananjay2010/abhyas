#!/usr/bin/env tsx
/**
 * Test LOW: At reps cap, don't say "goes up to 24 reps" when target doesn't move
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

const bodyweightMeta: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  metric: "reps",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

// Test 1: At reps cap (24 = 2 * repsMax 12), target already at 24, all sets at top
const atCapDecision = evaluateProgression({
  sets: [
    { reps: 24, weightKg: 0, durationSeconds: null },
    { reps: 24, weightKg: 0, durationSeconds: null },
    { reps: 24, weightKg: 0, durationSeconds: null },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: bodyweightMeta,
  state: {
    currentWorkingWeightKg: null,
    currentTargetReps: 24,
    consecutiveFailures: 0,
    bestWeightKg: null,
    bestReps: 24,
    bestE1rm: null,
    totalSessions: 10, weightAtFailureStartKg: null,
  },
  isDeload: false,
  equipmentIds: [],
  
});

check(
  "At reps cap 24 (already stored 24): says 'staying at 24 reps' not 'goes up to 24 reps'",
  atCapDecision.message.includes("staying at 24 reps") && !atCapDecision.message.includes("goes up to"),
  `got: ${atCapDecision.message}`
);

// Test 2: Below cap, target moves from 12 to 14
const belowCapDecision = evaluateProgression({
  sets: [
    { reps: 12, weightKg: 0, durationSeconds: null },
    { reps: 12, weightKg: 0, durationSeconds: null },
    { reps: 12, weightKg: 0, durationSeconds: null },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: bodyweightMeta,
  state: {
    currentWorkingWeightKg: null,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: null,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 5, weightAtFailureStartKg: null,
  },
  isDeload: false,
  equipmentIds: [],
  
});

check(
  "Below cap (target 12 → 14): says 'goes up to 14 reps'",
  belowCapDecision.message.includes("goes up to 14 reps"),
  `got: ${belowCapDecision.message}`
);

if (failures > 0) {
  console.log(`\n❌ FAILED: ${failures} checks`);
  process.exit(1);
}

console.log("\n✅ ALL CHECKS PASSED");
process.exit(0);
