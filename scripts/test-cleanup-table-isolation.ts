#!/usr/bin/env npx tsx
/**
 * Test W6: cleanBannedPlannedExercises only touches program_day_exercises.
 * 
 * Must ✗ FAIL if updates/deletes hit sessions or session_exercises tables.
 * Verifies table isolation: cleanup should never touch logged data.
 */

import { readFileSync } from "fs";
import { createFakeDb } from "./helpers/fake-postgrest";
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

console.log("Testing cleanup table isolation (W6)\n");

(async () => {
  const fake = createFakeDb({
    tables: {
      profiles: [{
      id: "user1",
      goal: "muscle_gain",
      level: "beginner",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      has_all_equipment: true,
    }],
    programs: [{
      id: "prog1",
      user_id: "user1",
      status: "active",
    }],
    user_injuries: [{
      user_id: "user1",
      body_region: "knee",
      severity: "current",
    }],
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
    user_equipment: [{ equipment_id: "kettlebell", user_id: "user1" }],
    program_days: [{ id: "pd1", program_id: "prog1", day_index: 1, day_type: "weights", status: "active" }],
    program_day_exercises: [{
      id: "pde1",
      program_day_id: "pd1",
      exercise_id: thruster.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      }],
    },
  });

  const { cleanBannedPlannedExercises } = await import("../src/lib/program/clean-banned-planned");
  
  await cleanBannedPlannedExercises(fake.client, "user1");
  
  // Check that only program_day_exercises was written to
  const writes = fake.requests.filter(r => r.method === "PATCH" || r.method === "DELETE");
  const illegalWrites = writes.filter(r => r.table !== "program_day_exercises");
  
  if (illegalWrites.length > 0) {
    console.error("✗ FAIL: cleanBannedPlannedExercises touched logged data tables");
    console.error(`  Illegal writes: ${illegalWrites.map(w => `${w.table}:${w.method}`).join(", ")}`);
    console.error("  Should only update/delete program_day_exercises");
    process.exit(1);
  }
  
  if (!writes.some(r => r.table === "program_day_exercises")) {
    console.error("✗ FAIL: cleanBannedPlannedExercises did not update program_day_exercises");
    console.error(`  Write operations: ${writes.map(w => `${w.table}:${w.method}`).join(", ")}`);
    process.exit(1);
  }
  
  console.log("✓ PASS: W6 killed - cleanup touches only program_day_exercises");
  console.log(`  Write operations: ${writes.map(w => `${w.table}:${w.method}`).join(", ")}`);
})();
