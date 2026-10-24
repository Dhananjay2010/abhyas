/**
 * Sweep test: ensure no-equipment cases are unchanged, and equipment cases
 * only differ in first-miss cases where the step is > 20%.
 *
 *   npx tsx scripts/test-first-miss-noequip-sweep.ts
 */
import { readFileSync } from "fs";
import {
  evaluateProgression,
  suggestedWeight,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";

const fixture = JSON.parse(
  readFileSync("scripts/fixtures/first-miss-noequip-main.json", "utf-8")
);

console.log(`\nLoaded ${fixture.count} cases from main ${fixture.mainSha.slice(0, 7)}`);

let noEquipDiffs = 0;
let equipDiffs = 0;
let equipFirstMissOver20 = 0;

// First sweep: no-equipment (exact equality)
for (const testCase of fixture.cases) {
  const meta: ExerciseMeta = {
    mechanic: testCase.mechanic ?? "compound",
    metric: "reps",
    movementPattern: testCase.pattern,
    isBodyweight: testCase.isBodyweight,
    progressionChain: testCase.isBodyweight ? testCase.pattern : null,
    progressionRank: testCase.isBodyweight ? 1 : null,
  };

  const state: ProgressState = {
    currentWorkingWeightKg: testCase.weight,
    currentTargetReps: 12,
    consecutiveFailures: testCase.failures,
    bestWeightKg: testCase.weight,
    bestReps: 12,
    bestE1rm: testCase.weight > 0 ? testCase.weight * 1.4 : null,
    totalSessions: 3,
  };

  const sets = Array.from({ length: 3 }, () => ({
    reps: testCase.reps,
    weightKg: testCase.weight,
  }));

  const result = evaluateProgression({
    sets,
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: testCase.feel,
    meta,
    state,
    isDeload: testCase.deload,
    // No equipmentIds or unit
  });

  const suggested = suggestedWeight(state, testCase.deload, meta);

  // Deep equality check
  const same =
    result.outcome === testCase.outcome &&
    result.nextWorkingWeightKg === testCase.nextWorkingWeightKg &&
    result.nextTargetReps === testCase.nextTargetReps &&
    result.consecutiveFailures === testCase.consecutiveFailures &&
    result.message === testCase.message &&
    suggested === testCase.suggestedWeight;

  if (!same) {
    noEquipDiffs++;
    console.error(`\nDIFF in no-equipment case:`);
    console.error(
      `  mechanic=${testCase.mechanic} pattern=${testCase.pattern} bodyweight=${testCase.isBodyweight}`
    );
    console.error(`  weight=${testCase.weight} failures=${testCase.failures} reps=${testCase.reps} feel=${testCase.feel} deload=${testCase.deload}`);
    console.error(`  Expected outcome=${testCase.outcome} weight=${testCase.nextWorkingWeightKg} failures=${testCase.consecutiveFailures}`);
    console.error(`  Got      outcome=${result.outcome} weight=${result.nextWorkingWeightKg} failures=${result.consecutiveFailures}`);
    console.error(`  Expected message: ${testCase.message}`);
    console.error(`  Got message:      ${result.message}`);
  }
}

console.log(`\nNo-equipment sweep: ${fixture.count} cases, ${noEquipDiffs} differences`);

// Second sweep: equipment cases verify expected behavior
const equipmentTests = [
  // Dumbbell 5 kg isolation: 50% cut, first miss, should HOLD
  { equipmentIds: ["dumbbell"], unit: "kg" as const, weight: 5, mechanic: "isolation" as const, failures: 0, expectedWeight: 5 },
  // Medicine ball 4 kg: 25% cut, first miss, should HOLD
  { equipmentIds: ["medicine_ball"], unit: "kg" as const, weight: 4, mechanic: "compound" as const, failures: 0, expectedWeight: 4 },
  // Barbell 40 kg: 6.25% cut, first miss, should DROP
  { equipmentIds: ["barbell"], unit: "kg" as const, weight: 40, mechanic: "compound" as const, failures: 0, expectedWeight: 37.5 },
  // Barbell 10 kg: 25% cut, first miss, should HOLD
  { equipmentIds: ["barbell"], unit: "kg" as const, weight: 10, mechanic: "compound" as const, failures: 0, expectedWeight: 10 },
  // Kettlebell 16 kg: 12.5% cut, first miss, should DROP
  { equipmentIds: ["kettlebell"], unit: "kg" as const, weight: 16, mechanic: "compound" as const, failures: 0, expectedWeight: 14 },
  // Kettlebell 8 kg: 25% cut, first miss, should HOLD
  { equipmentIds: ["kettlebell"], unit: "kg" as const, weight: 8, mechanic: "compound" as const, failures: 0, expectedWeight: 8 },
  // Second miss: uses two-miss back-off (not the guard)
  // 10 * 0.9 = 9, rounds to 1.25 grid = 8.75 (never more than one increment below 90%)
  { equipmentIds: ["dumbbell"], unit: "kg" as const, weight: 10, mechanic: "isolation" as const, failures: 1, expectedWeight: 8.75 },
];

for (const test of equipmentTests) {
  const meta: ExerciseMeta = {
    mechanic: test.mechanic,
    metric: "reps",
    movementPattern: "horizontal_press",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };

  const state: ProgressState = {
    currentWorkingWeightKg: test.weight,
    currentTargetReps: 12,
    consecutiveFailures: test.failures,
    bestWeightKg: test.weight,
    bestReps: 12,
    bestE1rm: test.weight > 0 ? test.weight * 1.4 : null,
    totalSessions: 3,
  };

  const sets = Array.from({ length: 3 }, () => ({
    reps: 10,
    weightKg: test.weight,
  }));

  const result = evaluateProgression({
    sets,
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta,
    state,
    isDeload: false,
    equipmentIds: test.equipmentIds,
    unit: test.unit,
  });

  if (result.nextWorkingWeightKg === test.expectedWeight) {
    equipFirstMissOver20++;
  } else {
    equipDiffs++;
    console.error(`\nERROR: Unexpected weight:`);
    console.error(`  ${test.equipmentIds[0]} ${test.weight} kg ${test.mechanic} failures=${test.failures}`);
    console.error(`  Expected: ${test.expectedWeight} kg`);
    console.error(`  Got:      ${result.nextWorkingWeightKg} kg`);
  }
}

console.log(`\nEquipment sweep: ${equipmentTests.length} cases checked`);
console.log(`  Correct: ${equipFirstMissOver20}`);
console.log(`  Incorrect: ${equipDiffs}`);

const totalFailures = noEquipDiffs + equipDiffs;
console.log(`\n${totalFailures === 0 ? "PASS" : "FAIL"} ${totalFailures} failure(s)`);
process.exit(totalFailures > 0 ? 1 : 0);
