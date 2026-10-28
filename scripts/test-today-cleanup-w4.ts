#!/usr/bin/env npx tsx
/**
 * W4: Today cleanup wiring - days.map(applyDayCleanup) must be called.
 * 
 * W4 mutant: Remove the .map(applyDayCleanup) call.
 * 
 * This test verifies that Today's loader applies cleanup to program days
 * when the user has a knee injury, replacing banned exercises.
 */

import { readFileSync } from "fs";
import { applyDayCleanup } from "../src/app/today/page";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");
if (!thruster) {
  console.error("✗ FAIL: kettlebell-thruster not found");
  process.exit(1);
}

console.log("Testing W4: Today cleanup wiring\n");

const day = {
  id: "day-1",
  day_index: 1,
  day_type: "weights" as const,
  focus: null,
  label: null,
  program_day_exercises: [
    {
      id: "pde-1",
      exercise_id: thruster.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: {
        name: "Kettlebell Thruster",
        cue: null,
        movement_pattern: "squat",
        metric: "reps",
      },
    },
  ],
};

const generatorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "muscle_gain" as const,
  level: "beginner" as const,
  primaryTrack: "weights" as const,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: true,
  equipmentIds: catalogue.flatMap(e => e.equipment_ids),
  currentInjuryRegions: ["knee" as const],
  anyKneeInjury: true,
  catalogue,
};

const cleanupResults: Array<{ changed: boolean }> = [];

const cleanedDay = applyDayCleanup(day, catalogue, generatorInput, cleanupResults);

if (cleanedDay.program_day_exercises.length === 0) {
  console.error("✗ FAIL: W4 - No exercises after cleanup");
  process.exit(1);
}

const firstExerciseId = cleanedDay.program_day_exercises[0].exercise_id;

if (firstExerciseId === thruster.id) {
  console.error("✗ FAIL: W4 - Banned exercise not replaced by Today cleanup");
  console.error(`  W4 mutant: days.map(applyDayCleanup) removed`);
  console.error(`  Expected: replacement exercise`);
  console.error(`  Got:      kettlebell-thruster (${thruster.id})`);
  process.exit(1);
}

const replacement = catalogue.find(e => e.id === firstExerciseId);

console.log("✓ PASS: W4 killed - Today cleanup replaces banned exercise");
console.log(`  Banned:      kettlebell-thruster (${thruster.id})`);
console.log(`  Replacement: ${replacement?.slug || 'unknown'} (${firstExerciseId})`);
console.log(`  Changed:     ${cleanupResults.some(r => r.changed)}`);
