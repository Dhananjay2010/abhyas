#!/usr/bin/env npx tsx
/**
 * Test ensure-session-exercises cleanup call site (M8/W3)
 * Tests that applyBannedCleanup is called inside ensureSessionExercises.
 * 
 * M8/W3 mutant: const cleaned = { rows: planned, changed: false }
 * (bypasses applyBannedCleanup call in ensure-session-exercises.ts)
 */

import { readFileSync } from "fs";
import { createFakeDb } from "./helpers/fake-postgrest";
import { ensureSessionExercises } from "../src/lib/session/ensure-session-exercises";
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

console.log("Testing M8/W3: ensure-session-exercises cleanup call site\n");

(async () => {
  const fake = createFakeDb({
    tables: {
      sessions: [{
        id: "s1",
        user_id: "u1",
        program_day_id: "pd1",
        actual_type: "weights",
        is_deload: false,
      }],
      session_exercises: [],
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

  await ensureSessionExercises(
    fake.client,
    "u1",
    "s1",
    catalogue,
    {
      goal: "muscle_gain",
      level: "beginner",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      has_all_equipment: true,
    },
    [{ body_region: "knee", severity: "current" }],
    catalogue.flatMap(e => e.equipment_ids)
  );

  const inserts = fake.requests.filter(r => r.method === "POST" && r.table === "session_exercises");
  if (inserts.length === 0) {
    console.error("✗ FAIL: No exercises inserted");
    process.exit(1);
  }

  const insertedExercises = inserts[0].body;
  if (!Array.isArray(insertedExercises) || insertedExercises.length === 0) {
    console.error("✗ FAIL: No exercises in insert body");
    process.exit(1);
  }

  const first = insertedExercises[0];

  if (first.exercise_id === thruster.id) {
    console.error("✗ FAIL: M8/W3 - ensureSessionExercises did not clean banned exercise");
    console.error(`  M8/W3 mutant: const cleaned = { rows: planned, changed: false }`);
    console.error(`  Expected: replacement, got banned: kettlebell-thruster (${thruster.id})`);
    process.exit(1);
  }

  const replacement = catalogue.find(e => e.id === first.exercise_id);

  console.log("✓ PASS: M8/W3 killed - ensureSessionExercises applies cleanup");
  console.log(`  Original: ${thruster.id}`);
  console.log(`  Cleaned:  ${first.exercise_id} (${replacement?.slug || 'unknown'})`);
})();
