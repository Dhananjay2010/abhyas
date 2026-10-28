#!/usr/bin/env npx tsx
/**
 * W5 call-site: Today loader cleanup wiring.
 * 
 * W5 mutant at page.tsx call site: Replace applyLoaderCleanup with identity.
 * 
 * This test verifies that the extracted applyLoaderCleanup function
 * correctly applies cleanup when called from Today's loader.
 */

import { readFileSync } from "fs";
import { applyLoaderCleanup } from "../src/lib/today/apply-loader-cleanup";
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

console.log("Testing W5 call-site: Today loader cleanup\n");

const days = [
  {
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
          movement_pattern: "squat" as const,
          metric: "reps" as const,
        },
      },
    ],
  },
];

const cleanupResults: Array<{ changed: boolean }> = [];

const result = applyLoaderCleanup(
  {
    days,
    injuries: [{ body_region: "knee", severity: "current" }],
    profile: {
      goal: "muscle_gain",
      level: "beginner",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      has_all_equipment: true,
    },
    catalogueRows,
    equipmentIds: catalogue.flatMap(e => e.equipment_ids),
    userId: "test-user",
    applyDayCleanup,
  },
  cleanupResults
);

if (!result || result.length === 0) {
  console.error("✗ FAIL: W5 - No days returned");
  process.exit(1);
}

if (result[0].program_day_exercises.length === 0) {
  console.error("✗ FAIL: W5 - No exercises after cleanup");
  process.exit(1);
}

const firstExerciseId = result[0].program_day_exercises[0].exercise_id;

if (firstExerciseId === thruster.id) {
  console.error("✗ FAIL: W5 call-site - Loader cleanup not applied");
  console.error(`  W5 mutant at page.tsx: applyLoaderCleanup replaced with identity`);
  console.error(`  Expected: replacement exercise`);
  console.error(`  Got:      kettlebell-thruster (${thruster.id})`);
  process.exit(1);
}

const replacement = catalogue.find(e => e.id === firstExerciseId);

console.log("✓ PASS: W5 call-site killed - Loader cleanup applied");
console.log(`  Banned:      kettlebell-thruster (${thruster.id})`);
console.log(`  Replacement: ${replacement?.slug || 'unknown'} (${firstExerciseId})`);
console.log(`  Changed:     ${cleanupResults.some(r => r.changed)}`);
