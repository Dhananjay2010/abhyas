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

  // ---------------------------------------------------------------------
  // Drop path (current knee, no safe alternative in the catalogue).
  // The scenario above only replaces (PATCH); this one forces the DELETE
  // branch, so a cleanup that deletes from the wrong table is caught.
  // A logged session_exercises row shares the planned row's id and
  // exercise, so a DELETE aimed at the wrong table would remove it.
  // ---------------------------------------------------------------------
  console.log("\nDrop path: banned slot with no safe alternative is deleted from program_day_exercises only");
  const ALLOWED_TABLES = new Set([
    "profiles", "user_injuries", "exercises", "programs", "user_equipment", "program_days", "program_day_exercises",
  ]);
  const thrusterRow = catalogueRows.find(e => e.id === thruster.id);
  if (!thrusterRow) {
    console.error("✗ FAIL: kettlebell-thruster row missing from fixture");
    process.exit(1);
  }
  const dropFake = createFakeDb({
    tables: {
      profiles: [{
        id: "user1", goal: "muscle_gain", level: "beginner", primary_track: "weights",
        days_per_week: 4, yoga_days_per_week: 0, has_all_equipment: true,
      }],
      programs: [{ id: "prog1", user_id: "user1", status: "active" }],
      user_injuries: [{ user_id: "user1", body_region: "knee", severity: "current" }],
      // Only the banned exercise exists, so there is no swap: the slot is dropped.
      exercises: [{
        id: thrusterRow.id, slug: thrusterRow.slug, name: thrusterRow.name,
        movement_pattern: thrusterRow.movement_pattern, mechanic: thrusterRow.mechanic, metric: thrusterRow.metric,
        primary_muscles: thrusterRow.primary_muscles, equipment_ids: thrusterRow.equipment_ids,
        level_min: thrusterRow.level_min, contraindicated_regions: thrusterRow.contraindicated_regions,
        impact: thrusterRow.impact, spinal_load: thrusterRow.spinal_load, tracks: thrusterRow.tracks,
        default_rest_seconds: thrusterRow.default_rest_seconds, category: thrusterRow.category, is_active: true,
      }],
      user_equipment: [],
      program_days: [{ id: "pd1", program_id: "prog1", day_index: 1, day_type: "weights", status: "active" }],
      program_day_exercises: [{
        id: "pde-drop", program_day_id: "pd1", exercise_id: thruster.id, order_index: 0,
        target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90,
      }],
      sessions: [{ id: "s-logged", user_id: "user1", program_day_id: "pd1", status: "completed" }],
      session_exercises: [{ id: "pde-drop", session_id: "s-logged", exercise_id: thruster.id, order_index: 0 }],
    },
  });

  const dropResult = await cleanBannedPlannedExercises(dropFake.client, "user1");
  const dropWrites = dropFake.requests.filter(r => r.method !== "GET");
  const describe = (list: typeof dropWrites) => list.map(w => `${w.table}:${w.method}`).join(", ") || "(none)";

  const outside = dropFake.requests.filter(r => !ALLOWED_TABLES.has(r.table));
  if (outside.length > 0) {
    console.error("✗ FAIL: drop path touched a table outside the cleanup's allowed set");
    console.error(`  Requests outside the set: ${describe(outside)}`);
    process.exit(1);
  }
  const deletes = dropWrites.filter(r => r.method === "DELETE");
  const plannedDelete = deletes.find(r =>
    r.table === "program_day_exercises" &&
    r.filters.id === "eq.pde-drop" &&
    r.filters.exercise_id === `eq.${thruster.id}`
  );
  if (!plannedDelete) {
    console.error("✗ FAIL: drop path did not DELETE the banned slot from program_day_exercises (CAS on id + exercise_id)");
    console.error(`  Writes: ${describe(dropWrites)}`);
    process.exit(1);
  }
  if (dropWrites.some(r => r.table !== "program_day_exercises")) {
    console.error("✗ FAIL: drop path wrote to a table other than program_day_exercises");
    console.error(`  Writes: ${describe(dropWrites)}`);
    process.exit(1);
  }
  if ((dropFake.tables.program_day_exercises ?? []).some(r => r.id === "pde-drop")) {
    console.error("✗ FAIL: banned planned slot still present after the drop");
    process.exit(1);
  }
  const logged = dropFake.tables.session_exercises ?? [];
  if (logged.length !== 1 || logged[0].id !== "pde-drop" || logged[0].exercise_id !== thruster.id) {
    console.error("✗ FAIL: logged session_exercises row was changed by the cleanup");
    process.exit(1);
  }
  if (dropResult.cleaned !== 1 || dropResult.errors.length !== 0) {
    console.error(`✗ FAIL: drop path result wrong: cleaned=${dropResult.cleaned}, errors=${dropResult.errors.join("; ")}`);
    process.exit(1);
  }
  console.log("✓ PASS: drop path deletes only program_day_exercises; logged session_exercises untouched");
  console.log(`  Write operations: ${describe(dropWrites)}`);
})();
