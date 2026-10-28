#!/usr/bin/env npx tsx
/**
 * METRIC-start: Metric not updated when starting session
 * 
 * Mutant: Don't copy metric from catalogue in cleanBannedExercises
 *         'exercises: e.exercises, // MUTANT: metric not updated'
 * 
 * Test: Start session with banned reps exercise. The only safe replacement is
 * a timed hold (seconds). Assert the cleanBannedExercises result has correct metric.
 */

import { readFileSync } from "fs";
import { createFakeDb } from "./helpers/fake-postgrest";
import { buildStartSessionFullDeps } from "../src/lib/session/start-session-full-deps";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const fullCatalogue = toCandidateExercises(catalogueRows);

// Find plank (timed hold, metric: seconds)
const plank = fullCatalogue.find(e => e.slug === "plank");
if (!plank || plank.metric !== "seconds") {
  console.error("✗ FAIL: plank not found or wrong metric");
  process.exit(1);
}

console.log("Testing METRIC-start: Replacement metric must be copied from catalogue\n");

(async () => {
  const fake = createFakeDb({
    tables: {
      profiles: [{
        id: "u1",
        goal: "muscle_gain",
        level: "beginner",
        primary_track: "weights",
        days_per_week: 4,
        yoga_days_per_week: 0,
        has_all_equipment: true,
      }],
      user_injuries: [],
      exercises: [plank].map(e => ({
        id: e.id,
        slug: e.slug,
        name: e.name,
        movement_pattern: e.movement_pattern,
        mechanic: e.mechanic,
        metric: e.metric,
        primary_muscles: e.primary_muscles,
        equipment_ids: e.equipment_ids,
        level_min: e.level_min,
        contraindicated_regions: e.contraindicated_regions,
        impact: e.impact,
        spinal_load: e.spinal_load,
        tracks: e.tracks,
        default_rest_seconds: e.default_rest_seconds,
        category: e.category,
        is_active: true,
      })),
      user_equipment: [],
    },
  });

  const deps = buildStartSessionFullDeps(fake.client, "u1", Date.now());
  
  // Plan an exercise with WRONG metric that needs cleanup
  // Simulate it being replaced with plank (seconds)
  const plannedExercises = [{
    id: "pde1",
    exercise_id: plank.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
    exercises: { metric: "reps" }, // WRONG - should be seconds
  }];
  
  const cleaned = await deps.cleanBannedExercises?.(plannedExercises);

  if (!cleaned || cleaned.length === 0) {
    console.error("✗ FAIL: cleanBannedExercises returned empty");
    process.exit(1);
  }

  // Check the metric was updated from catalogue
  const firstCleaned = cleaned[0];
  const cleanedMetric = "exercises" in firstCleaned && 
                         firstCleaned.exercises && 
                         typeof firstCleaned.exercises === "object" &&
                         "metric" in firstCleaned.exercises
    ? firstCleaned.exercises.metric
    : undefined;
  
  if (cleanedMetric !== "seconds") {
    console.error("✗ FAIL: METRIC-start - metric not updated from catalogue");
    console.error(`  Expected: seconds (from ${plank.slug})`);
    console.error(`  Got: ${cleanedMetric}`);
    console.error(`  Mutant skipped metric update in cleanBannedExercises`);
    process.exit(1);
  }

  console.log("✓ PASS: METRIC-start killed - metric updated from catalogue");
  console.log(`  Exercise: ${plank.slug}`);
  console.log(`  Planned metric: reps (wrong)`);
  console.log(`  Cleaned metric: ${cleanedMetric} (corrected from catalogue)`);
})();
