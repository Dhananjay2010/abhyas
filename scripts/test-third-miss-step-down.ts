#!/usr/bin/env tsx
/**
 * Test: Full third-miss sequence (Decision F)
 * 
 * Decision F changes the progression sequence:
 * - Miss 1: holds at current weight, counter = 1, failure-start = current
 * - Miss 2: backs off ~10%, counter = 0, failure-start = null
 * - Miss 3: holds at new weight, counter = 1, failure-start = new weight
 * - Miss 4: backs off again ~10%
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState, type LoggedSet } from "@/lib/program/progression";

let failures = 0;

function check(desc: string, pass: boolean, detail = ""): void {
  if (!pass) {
    console.log(`  ❌ FAIL ${desc}${detail ? ` -- ${detail}` : ""}`);
    failures++;
  } else {
    console.log(`  ✓ ${desc}`);
  }
}

const meta: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const missingSets: LoggedSet[] = [
  { reps: 5, weightKg: 60 },
  { reps: 4, weightKg: 60 },
  { reps: 3, weightKg: 60 },
];

console.log("\n=== Full Third-Miss Sequence (Decision F) ===\n");

// Miss 1: holds at 60 kg
{
  const state: ProgressState = {
    currentWorkingWeightKg: 60,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 60,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 1,
    weightAtFailureStartKg: null,
  };
  
  const d = evaluateProgression({
    sets: missingSets,
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta,
    state,
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  console.log("Miss 1:");
  check("holds at 60 kg", d.nextWorkingWeightKg === 60, `got ${d.nextWorkingWeightKg}`);
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("counter = 1", d.consecutiveFailures === 1, `got ${d.consecutiveFailures}`);
  check("failure-start = 60", d.weightAtFailureStartKg === 60, `got ${d.weightAtFailureStartKg}`);
  check("message: Staying at this weight", d.message === "Staying at this weight until every set reaches the top of the range.", d.message);
}

// Miss 2: backs off to 52.5 kg
{
  const state: ProgressState = {
    currentWorkingWeightKg: 60,
    currentTargetReps: 12,
    consecutiveFailures: 1,
    bestWeightKg: 60,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 2,
    weightAtFailureStartKg: 60,
  };
  
  const d = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 60 })),
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta,
    state,
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  console.log("\nMiss 2:");
  check("backs off to 52.5 kg", d.nextWorkingWeightKg === 52.5, `got ${d.nextWorkingWeightKg}`);
  check("outcome is backed_off", d.outcome === "backed_off", d.outcome);
  check("counter = 0", d.consecutiveFailures === 0, `got ${d.consecutiveFailures}`);
  check("failure-start = null", d.weightAtFailureStartKg === null, `got ${d.weightAtFailureStartKg}`);
  check("message includes 52.5 kg", d.message.includes("52.5"), d.message);
}

// Miss 3: holds at 52.5 kg
{
  const state: ProgressState = {
    currentWorkingWeightKg: 52.5,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 60,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 3,
    weightAtFailureStartKg: null,
  };
  
  const d = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 52.5 })),
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta,
    state,
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  console.log("\nMiss 3:");
  check("holds at 52.5 kg", d.nextWorkingWeightKg === 52.5, `got ${d.nextWorkingWeightKg}`);
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("counter = 1", d.consecutiveFailures === 1, `got ${d.consecutiveFailures}`);
  check("failure-start = 52.5", d.weightAtFailureStartKg === 52.5, `got ${d.weightAtFailureStartKg}`);
  check("message: Staying at this weight", d.message === "Staying at this weight until every set reaches the top of the range.", d.message);
}

// Miss 4: backs off to 45 kg
{
  const state: ProgressState = {
    currentWorkingWeightKg: 52.5,
    currentTargetReps: 12,
    consecutiveFailures: 1,
    bestWeightKg: 60,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 4,
    weightAtFailureStartKg: 52.5,
  };
  
  const d = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 52.5 })),
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta,
    state,
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  console.log("\nMiss 4:");
  check("backs off to 45 kg", d.nextWorkingWeightKg === 45, `got ${d.nextWorkingWeightKg}`);
  check("outcome is backed_off", d.outcome === "backed_off", d.outcome);
  check("counter = 0", d.consecutiveFailures === 0, `got ${d.consecutiveFailures}`);
  check("failure-start = null", d.weightAtFailureStartKg === null, `got ${d.weightAtFailureStartKg}`);
  check("message includes 45", d.message.includes("45"), d.message);
}

if (failures === 0) {
  console.log("\n✅ All third-miss sequence tests passed");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
}
