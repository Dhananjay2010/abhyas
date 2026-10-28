/**
 * Test: Barbell calf raise progression at 40 kg must produce 42.5 kg (not 41.25 kg).
 * 
 * QA reported barbell calf raise showing "up to 41.25 kg" which is impossible to load
 * on a barbell (requires 2.5 kg increments, 1.25 kg per side).
 * 
 * This test verifies:
 * 1. At 02ce6f5b (before fix), barbell calf + easy = 41.25 kg (FAIL)
 * 2. On HEAD (after fix), barbell calf + easy = 42.5 kg (PASS)
 * 3. All barbell progressions from 20-150 kg land on 2.5 kg multiples
 */

import { evaluateProgression, suggestedWeight, type ExerciseMeta } from "../src/lib/program/progression";

const BARBELL_CALF: ExerciseMeta = {
  mechanic: "isolation",
  movementPattern: "calf",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("QA Case: Barbell calf raise at 40 kg, success + easy\n");

// Test with easy feel (QA's actual case)
const decision = evaluateProgression({
  sets: [
    { reps: 12, weightKg: 40, durationSeconds: null },
    { reps: 12, weightKg: 40, durationSeconds: null },
    { reps: 12, weightKg: 40, durationSeconds: null },
    { reps: 12, weightKg: 40, durationSeconds: null },
  ],
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "easy",
  meta: BARBELL_CALF,
  state: {
    currentWorkingWeightKg: 40,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 40,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 5,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  equipmentIds: ["barbell"],
});

console.log(`  Next weight: ${decision.nextWorkingWeightKg} kg`);
console.log(`  Message: ${decision.message}`);

if (decision.nextWorkingWeightKg === null) {
  throw new Error("Expected next weight but got null");
}

const isValidBarbell = decision.nextWorkingWeightKg % 2.5 === 0;
check("Barbell isolation at 40kg + easy → 42.5kg", decision.nextWorkingWeightKg === 42.5, `got ${decision.nextWorkingWeightKg}`);
check("Result is on 2.5kg grid", isValidBarbell, `${decision.nextWorkingWeightKg} % 2.5 = ${decision.nextWorkingWeightKg % 2.5}`);
check("Message includes weight", decision.message.includes("42.5 kg"), decision.message);

// Test with right feel (standard case)
console.log("\nStandard Case: Barbell calf raise at 40 kg, success + right\n");

const decisionRight = evaluateProgression({
  sets: [
    { reps: 12, weightKg: 40, durationSeconds: null },
    { reps: 12, weightKg: 40, durationSeconds: null },
    { reps: 12, weightKg: 40, durationSeconds: null },
    { reps: 12, weightKg: 40, durationSeconds: null },
  ],
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BARBELL_CALF,
  state: {
    currentWorkingWeightKg: 40,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 40,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 5,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  equipmentIds: ["barbell"],
});

console.log(`  Next weight: ${decisionRight.nextWorkingWeightKg} kg`);
console.log(`  Message: ${decisionRight.message}`);

if (decisionRight.nextWorkingWeightKg === null) {
  throw new Error("Expected next weight but got null");
}

check("Barbell isolation at 40kg + right → 42.5kg", decisionRight.nextWorkingWeightKg === 42.5, `got ${decisionRight.nextWorkingWeightKg}`);
check("Right feel on 2.5kg grid", decisionRight.nextWorkingWeightKg % 2.5 === 0);

// Sweep test: all barbell progressions from 20-150 kg
console.log("\nBarbell Grid Sweep: 20-150 kg\n");

for (let weight = 20; weight <= 150; weight += 5) {
  const sweepDecision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: weight, durationSeconds: null },
      { reps: 12, weightKg: weight, durationSeconds: null },
      { reps: 12, weightKg: weight, durationSeconds: null },
      { reps: 12, weightKg: weight, durationSeconds: null },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BARBELL_CALF,
    state: {
      currentWorkingWeightKg: weight,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: weight,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 5,
      weightAtFailureStartKg: null,
    },
    isDeload: false,
    equipmentIds: ["barbell"],
  });

  const next = sweepDecision.nextWorkingWeightKg;
  if (next === null) {
    check(`${weight}kg → null (unexpected)`, false, "next weight is null");
    continue;
  }
  
  const onGrid = next % 2.5 === 0;
  
  if (!onGrid) {
    check(`${weight}kg → ${next}kg on grid`, onGrid, `${next} % 2.5 = ${next % 2.5}`);
  }
}

console.log("  ok   All weights 20-150kg land on 2.5kg grid\n");

console.log("Deload Case: Barbell isolation 102kg → deload (use suggestedWeight directly)\n");

// Test suggestedWeight (the deload calculation) which uses incrementFor with equipmentIds
// 102 * 0.7 = 71.4
// With 2.5kg grid (barbell): rounds to 72.5kg
// With 1.25kg grid (isolation, no equipment): rounds to 71.25kg
// This distinguishes the mutant from correct code.
const deloadWeight = suggestedWeight(
  { currentWorkingWeightKg: 102 },
  true, // isDeload
  BARBELL_CALF,
  ["barbell"],
);

console.log(`  Deload from 102kg: ${deloadWeight} kg`);

if (deloadWeight === null) {
  throw new Error("Expected deload weight but got null");
}

// Deload should be 72.5kg (71.4 rounded to 2.5kg grid)
// BARBELL mutant would give 71.25kg (71.4 rounded to 1.25kg grid)
const deloadOnGrid = deloadWeight % 2.5 === 0;

check("Deload 102kg → 72.5kg (2.5kg grid)", deloadWeight === 72.5, `got ${deloadWeight}`);
check("Deload result on 2.5kg grid", deloadOnGrid, `${deloadWeight} % 2.5 = ${deloadWeight % 2.5}`);

console.log(failures > 0 ? `\n❌ ${failures} failure(s)\n` : "\n✅ All barbell grid tests passed\n");
process.exit(failures > 0 ? 1 : 0);
