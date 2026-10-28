#!/usr/bin/env npx tsx
/**
 * W2: buildStartSessionFullDeps().cleanBannedExercises must replace banned exercises.
 * 
 * W2 mutant: `return exercises` (no cleanup applied).
 * This test calls cleanBannedExercises directly with a fake Supabase client
 * that returns canned data per table.
 */

import { readFileSync } from "fs";
import { createFakeDb } from "./helpers/fake-postgrest";
import { buildStartSessionFullDeps } from "../src/lib/session/start-session-full-deps";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";
import type { ProgramDayExercise } from "../src/lib/session/start-session-full-core";

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

console.log("Testing W2: cleanBannedExercises must replace banned exercises\n");

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
      programs: [{
        id: "prog1",
        user_id: "u1",
        status: "active",
        started_on: "2024-01-01",
        deload_week: 4,
        week_offset: 0,
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
    },
  });

  const deps = buildStartSessionFullDeps(fake.client, "u1", Date.now());

  const plannedExercises = [
    {
      id: "pde1",
      exercise_id: thruster.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    },
  ];

  if (!deps.cleanBannedExercises) {
    console.error("✗ FAIL: cleanBannedExercises not provided by buildStartSessionFullDeps");
    process.exit(1);
  }
  
  const cleaned = await deps.cleanBannedExercises!(plannedExercises as ProgramDayExercise[]);
  
  if (cleaned.length === 0) {
    console.error("✗ FAIL: cleanBannedExercises returned empty array");
    process.exit(1);
  }
  
  const first = cleaned[0];
  
  if (first.exercise_id === thruster.id) {
    console.error("✗ FAIL: W2 - cleanBannedExercises returned original (banned) exercise");
    console.error(`  W2 mutant: return exercises`);
    console.error(`  Expected replacement, got banned: kettlebell-thruster (${thruster.id})`);
    process.exit(1);
  }
  
  const replacement = catalogue.find(e => e.id === first.exercise_id);
  
  console.log("✓ PASS: W2 killed - cleanBannedExercises replaced banned exercise");
  console.log(`  Banned:      kettlebell-thruster (${thruster.id})`);
  console.log(`  Replacement: ${replacement?.slug || 'unknown'} (${first.exercise_id})`);
})();
