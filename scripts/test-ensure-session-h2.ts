#!/usr/bin/env npx tsx
/**
 * H2-unwired/W3: ensureSessionExercises must replace banned exercises.
 * 
 * H2 mutant: ensureSessionExercises not wired (no cleanup call).
 * W3 mutant: cleanup no-op in ensureSessionExercises.
 * This test calls buildStartSessionFullDeps(fake).ensureSessionExercises(sessionId)
 * with 0 existing session_exercises and a planned day containing banned slug.
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
  console.error("✗ FAIL: kettlebell-thruster not found");
  process.exit(1);
}

console.log("Testing H2/W3: ensureSessionExercises must replace banned\n");

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
      sessions: [{
        id: "s1",
        user_id: "u1",
        program_id: "prog1",
        program_day_id: "pd1",
        local_date: "2024-01-15",
        status: "in_progress",
        started_at: "2024-01-15T10:00:00Z",
        actual_type: "strength",
      }],
      session_exercises: [],
      user_injuries: [{
        user_id: "u1",
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
      user_equipment: catalogue.flatMap(e => e.equipment_ids.map(id => ({ equipment_id: id, user_id: "u1" }))),
      program_days: [{
        id: "pd1",
        program_id: "prog1",
        day_index: 1,
        day_type: "strength",
        status: "active",
      }],
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

  const deps = buildStartSessionFullDeps(fake.client, "u1", Date.now());

  await deps.ensureSessionExercises("s1");
  
  const inserts = fake.requests.filter(r => r.method === "POST" && r.table === "session_exercises");
  if (inserts.length === 0) {
    console.error("✗ FAIL: No session exercises inserted");
    process.exit(1);
  }
  
  const insertedExercises = inserts[0].body;
  if (!Array.isArray(insertedExercises) || insertedExercises.length === 0) {
    console.error("✗ FAIL: No exercises in insert body");
    process.exit(1);
  }
  
  const first = insertedExercises[0];
  
  if (first.exercise_id === thruster.id) {
    console.error("✗ FAIL: H2/W3 - inserted banned exercise (not replaced)");
    console.error(`  H2 mutant: ensureSessionExercises not wired to cleanup`);
    console.error(`  W3 mutant: cleanup no-op in ensureSessionExercises`);
    console.error(`  Expected replacement, got banned: kettlebell-thruster (${thruster.id})`);
    process.exit(1);
  }
  
  const replacement = catalogue.find(e => e.id === first.exercise_id);
  
  console.log("✓ PASS: H2/W3 killed - ensureSessionExercises replaced banned exercise");
  console.log(`  Session:     s1 (0 existing exercises)`);
  console.log(`  Banned:      kettlebell-thruster (${thruster.id})`);
  console.log(`  Replacement: ${replacement?.slug || 'unknown'} (${first.exercise_id})`);
})();
