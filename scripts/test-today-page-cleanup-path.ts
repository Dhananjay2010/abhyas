#!/usr/bin/env npx tsx
/**
 * Test Today page cleanup path (M7: Today call site)
 * Tests that replaceBannedInPlanned is actually called in applyDayCleanup.
 * 
 * If the call is removed or no-op'd, this test must fail.
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

console.log("Testing Today page cleanup call site\n");

// Simulate a program day with kettlebell-thruster
const day = {
  id: "day-1",
  day_index: 1,
  day_type: "weights",
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

// Current-knee user (matches Today page generatorInput)
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

const cleanupResults: { changed: boolean }[] = [];

// Call the extracted Today page helper
const cleanedDay = applyDayCleanup(day, catalogue, generatorInput, cleanupResults);

// If the call is removed/no-op'd, thruster won't be replaced
if (cleanedDay.program_day_exercises[0].exercise_id === thruster.id) {
  console.error("✗ FAIL: kettlebell-thruster not replaced in Today path");
  console.error("  The Today page cleanup call may have been removed or bypassed");
  process.exit(1);
}

if (cleanupResults.length === 0 || !cleanupResults[0].changed) {
  console.error("✗ FAIL: cleanup not tracked");
  console.error("  The Today page cleanup call may have been removed or bypassed");
  process.exit(1);
}

console.log("✓ PASS: Today page cleanup call site works");
console.log(`  Original: ${thruster.id}`);
console.log(`  Cleaned:  ${cleanedDay.program_day_exercises[0].exercise_id}`);
