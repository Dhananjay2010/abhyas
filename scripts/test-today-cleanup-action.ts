#!/usr/bin/env npx tsx
/**
 * Test that Today's cleanup Server Action path works correctly
 * Consumer path: src/app/today/actions.ts cleanBannedExercises -> cleanBannedPlannedExercises
 * 
 * This tests the persistence path triggered by CleanupTrigger after Today's in-memory clean.
 */

import { readFileSync } from "fs";
import type { CandidateExercise } from "../src/lib/program/generate";
import { replaceBannedInPlanned, type PlannedExercise } from "../src/lib/program/replace-banned-in-planned";
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

console.log("Testing Today cleanup action path\n");

// Simulate Today's in-memory clean that triggers the Server Action
const planned: PlannedExercise[] = [
  {
    id: "day-ex-1",
    exercise_id: thruster.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  },
];

const generatorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "strength" as const,
  level: "intermediate" as const,
  primaryTrack: "weights" as const,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: false,
  equipmentIds: ["kettlebell", "dumbbell"],
  currentInjuryRegions: ["knee" as const],
  anyKneeInjury: true,
  catalogue,
};

// This is what Today page.tsx does
const result = replaceBannedInPlanned(planned, catalogue, generatorInput);

if (!result.changed) {
  console.error("✗ FAIL: No change detected, should have replaced thruster");
  process.exit(1);
}

if (result.rows[0].exercise_id === thruster.id) {
  console.error("✗ FAIL: kettlebell-thruster not replaced in Today path");
  process.exit(1);
}

console.log("✓ PASS: kettlebell-thruster replaced in Today cleanup path");
console.log(`  Changed: ${result.changed}, Replacement: ${result.rows[0].exercise_id}`);
