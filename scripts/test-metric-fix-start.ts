#!/usr/bin/env npx tsx
/**
 * METRIC-start: Metric not updated when starting session
 * 
 * Mutant: Don't copy metric from catalogue in cleanBannedExercises
 * 
 * Test: Start session with banned reps exercise. Verify the replacement
 * (which might have a different metric like "seconds" for holds) has the
 * correct metric copied into the session_exercises INSERT.
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
const catalogue = toCandidateExercises(catalogueRows);

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");

if (!thruster) {
  console.error("✗ FAIL: test exercise not found");
  process.exit(1);
}

console.log("Testing METRIC-start: Replacement metric copied to cleanBannedExercises result\n");

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
      user_injuries: [{ user_id: "u1", body_region: "knee", severity: "current" }],
      exercises: catalogueRows.map(e => ({
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
  
  const plannedExercises = [{
    id: "pde1",
    exercise_id: thruster.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
    exercises: { metric: "reps" as const },
  }];
  
  const cleaned = await deps.cleanBannedExercises?.(plannedExercises);

  if (!cleaned || cleaned.length === 0) {
    console.error("✗ FAIL: cleanBannedExercises returned empty");
    process.exit(1);
  }

  const replacementId = cleaned[0].exercise_id;
  const replacementExercise = catalogue.find(e => e.id === replacementId);

  if (!replacementExercise) {
    console.error("✗ FAIL: replacement not in catalogue");
    process.exit(1);
  }

  if (replacementId === thruster.id) {
    console.error("✗ FAIL: METRIC-start - banned exercise not replaced");
    process.exit(1);
  }

  // The cleaned result should have the replacement's metric from catalogue
  // Check the actual exercises object on the cleaned row
  type CleanedRow = typeof cleaned[0];
  const cleanedMetric = (cleaned[0] as CleanedRow & { exercises?: { metric?: string } }).exercises?.metric;
  
  if (cleanedMetric !== replacementExercise.metric) {
    console.error("✗ FAIL: METRIC-start - metric not updated from catalogue");
    console.error(`  Replacement: ${replacementExercise.slug} (metric: ${replacementExercise.metric})`);
    console.error(`  Cleaned metric: ${cleanedMetric}`);
    console.error(`  Mutant skipped metric update in cleanBannedExercises`);
    process.exit(1);
  }

  console.log("✓ PASS: METRIC-start killed - replacement metric copied correctly");
  console.log(`  Original: ${thruster.slug} (${thruster.metric})`);
  console.log(`  Replacement: ${replacementExercise.slug} (${replacementExercise.metric})`);
})();
