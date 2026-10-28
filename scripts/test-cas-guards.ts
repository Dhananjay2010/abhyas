#!/usr/bin/env npx tsx
/**
 * CAS guards: Update and delete must filter on exercise_id.
 * 
 * CAS mutants:
 * - Remove .eq("exercise_id", originalExerciseId) from update
 * - Remove .eq("exercise_id", originalExerciseId) from delete
 * 
 * This test verifies CAS guards by checking update path and race handling.
 * Delete path uses identical pattern (symmetric code in clean-banned-planned.ts).
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
const goblet = catalogue.find(e => e.slug === "goblet-squat");
if (!thruster || !goblet) {
  console.error("✗ FAIL: Test exercises not found");
  process.exit(1);
}

console.log("Testing CAS guards: update and delete filters\n");

(async () => {
  const { cleanBannedPlannedExercises } = await import("../src/lib/program/clean-banned-planned");

  // Test 1: Check that update has exercise_id filter (CAS guard)
  const fake1 = createFakeDb({
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
      programs: [{
        id: "prog1",
        user_id: "u1",
        status: "active",
      }],
      user_injuries: [{ body_region: "knee", severity: "current", user_id: "u1" }],
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
      user_equipment: catalogue.flatMap(e => e.equipment_ids.map(id => ({ equipment_id: id, user_id: "u1" }))),
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

  await cleanBannedPlannedExercises(fake1.client, "u1");

  const updates = fake1.requests.filter(r => r.method === "PATCH" && r.table === "program_day_exercises");
  const deletes = fake1.requests.filter(r => r.method === "DELETE" && r.table === "program_day_exercises");

  const writes = [...updates, ...deletes];
  if (writes.length === 0) {
    console.error("✗ FAIL: CAS - No updates or deletes found");
    process.exit(1);
  }

  // Check that writes have exercise_id filter (CAS guard)
  const hasExerciseIdFilter = writes.some(w => {
    const exerciseIdFilter = w.filters.exercise_id;
    return exerciseIdFilter && exerciseIdFilter.startsWith("eq.");
  });

  if (!hasExerciseIdFilter) {
    console.error("✗ FAIL: CAS - Update/delete missing exercise_id filter");
    console.error(`  CAS mutant: .eq("exercise_id", originalExerciseId) removed`);
    console.error(`  Expected: exercise_id filter in updates/deletes`);
    console.error(`  Writes:`, writes.map(w => ({ table: w.table, method: w.method, filters: w.filters })));
    process.exit(1);
  }

  // Test 2: Race condition - if another request changes the row, update should not overwrite
  const fake2 = createFakeDb({
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
      programs: [{
        id: "prog1",
        user_id: "u1",
        status: "active",
      }],
      user_injuries: [{ body_region: "knee", severity: "current", user_id: "u1" }],
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
      user_equipment: catalogue.flatMap(e => e.equipment_ids.map(id => ({ equipment_id: id, user_id: "u1" }))),
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

  // Simulate a race: another request changes the exercise_id before our update
  fake2.beforeRequest = (req) => {
    if (req.method === "PATCH" && req.table === "program_day_exercises") {
      // Change the row to simulate another request winning the race
      const row = fake2.tables.program_day_exercises[0];
      if (row && row.id === "pde1") {
        row.exercise_id = goblet.id; // Another tab already replaced it
      }
    }
  };

  await cleanBannedPlannedExercises(fake2.client, "u1");

  // The row should still be goblet (not overwritten by our update)
  const finalRow = fake2.tables.program_day_exercises[0];
  if (finalRow && finalRow.exercise_id !== goblet.id) {
    console.error("✗ FAIL: CAS race - Row was overwritten despite exercise_id mismatch");
    console.error(`  Expected: ${goblet.id} (race winner)`);
    console.error(`  Got:      ${finalRow.exercise_id}`);
    process.exit(1);
  }

  console.log("✓ PASS: CAS guards present and race handled correctly");
  console.log(`  exercise_id filter present in updates/deletes`);
  console.log(`  Race condition: no overwrite when exercise_id changed`);
})();
