#!/usr/bin/env npx tsx
/**
 * W4: Today cleanup call removed
 * 
 * Mutant: `return days;` (cleanup skipped in apply-loader-cleanup.ts line 111)
 * 
 * Test: Call applyLoaderCleanup with a day containing banned exercise.
 * Assert the returned day has the banned exercise replaced.
 */

import { readFileSync } from "fs";
import { applyLoaderCleanup } from "../src/lib/today/apply-loader-cleanup";
import { replaceBannedInPlanned } from "../src/lib/program/replace-banned-in-planned";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");

if (!thruster) {
  console.error("✗ FAIL: test exercise not found");
  process.exit(1);
}

console.log("Testing W4: Today cleanup call in apply-loader-cleanup\n");

const days = [{
  id: "pd1",
  day_index: 1,
  day_type: "weights" as const,
  focus: "lower",
  label: "Lower A",
  program_day_exercises: [{
    id: "pde1",
    exercise_id: thruster.id, // BANNED for current-knee
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
    exercises: {
      name: thruster.name,
      cue: null,
      movement_pattern: thruster.movement_pattern,
      metric: "reps" as const,
    },
  }],
}];

const cleanupResults: { changed: boolean }[] = [];

const result = applyLoaderCleanup(
  {
    days,
    injuries: [{ body_region: "knee", severity: "current" }],
    profile: {
      goal: "general_fitness",
      level: "beginner",
      primary_track: "balanced",
      days_per_week: 4,
      yoga_days_per_week: 0,
      has_all_equipment: false,
    },
    catalogueRows,
    equipmentIds: [],
    userId: "u1",
    applyDayCleanup: (day, catalogue, generatorInput, cleanupResults) => {
      const injuryList = generatorInput.injuries;
      const result = replaceBannedInPlanned(
        day.program_day_exercises,
        injuryList,
        generatorInput.equipmentIds,
        catalogue,
        generatorInput.userId
      );
      cleanupResults.push({ changed: result.changed });
      return {
        ...day,
        program_day_exercises: result.exercises,
      };
    },
  },
  cleanupResults
);

if (!result || result.length === 0) {
  console.error("✗ FAIL: No days returned");
  process.exit(1);
}

const exerciseIds = result[0].program_day_exercises.map(e => e.exercise_id);

if (exerciseIds.includes(thruster.id)) {
  console.error("✗ FAIL: W4 - banned exercise (kettlebell-thruster) in returned day");
  console.error(`  Input had: ${thruster.slug} (${thruster.id})`);
  console.error(`  Mutant returned days without applyDayCleanup`);
  process.exit(1);
}

if (cleanupResults.length === 0) {
  console.error("✗ FAIL: applyDayCleanup was never called");
  console.error(`  Mutant skipped .map(applyDayCleanup)`);
  process.exit(1);
}

console.log("✓ PASS: W4 killed - cleanup was applied to days");
console.log(`  Input had: kettlebell-thruster (${thruster.id})`);
console.log(`  Cleaned:   ${exerciseIds.length} exercises (no banned)`);
console.log(`  Cleanup called: ${cleanupResults.length} times`);
