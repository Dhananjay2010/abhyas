#!/usr/bin/env npx tsx
/**
 * METRIC-ensure: Metric not updated when ensuring exercises
 * 
 * Mutant: Don't use catalogue metric in ensure-session-exercises.ts
 * 
 * Test: Resume session where an exercise was replaced (banned → safe).
 * The session_exercises row has wrong metric. Assert ensureSessionExercises
 * updates it with the correct metric from catalogue.
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
const goblet = catalogue.find(e => e.slug === "goblet-squat");

if (!thruster || !goblet) {
  console.error("✗ FAIL: test exercises not found");
  process.exit(1);
}

if (thruster.metric === goblet.metric) {
  console.error("✗ FAIL: test exercises have same metric, can't test");
  process.exit(1);
}

console.log("Testing METRIC-ensure: Replacement metric in ensure exercises\n");

(async () => {
  const fake = createFakeDb({
    profiles: [{
      id: "u1",
      current_injury_regions: ["knee"],
      past_injury_regions: [],
      equipment_ids: [],
    }],
    programs: [{
      id: "prog1",
      user_id: "u1",
      status: "active",
      started_on: "2024-01-01",
      deload_week: 4,
      week_offset: 0,
      current_block_id: "block1",
    }],
    program_days: [{
      id: "pd1",
      program_id: "prog1",
      day_of_week: 1,
      day_type: "weights",
      label: "Lower A",
    }],
    program_day_exercises: [{
      id: "pde1",
      program_day_id: "pd1",
      exercise_id: goblet.id, // Replacement (was thruster before cleanup)
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    }],
    sessions: [{
      id: "s1",
      user_id: "u1",
      program_id: "prog1",
      program_day_id: "pd1",
      local_date: "2024-01-15",
      status: "in_progress",
      started_at: null,
      actual_type: "weights",
    }],
    session_exercises: [{
      id: "se1",
      session_id: "s1",
      exercise_id: goblet.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: {
        name: goblet.name,
        metric: thruster.metric, // WRONG - should be goblet.metric
      },
    }],
  });

  await ensureSessionExercises(fake.client, "s1", "u1");

  // Find PATCH to session_exercises
  const patches = fake.requests.filter(
    r => r.method === "PATCH" && r.table === "session_exercises"
  );

  if (patches.length === 0) {
    console.error("✗ FAIL: No session_exercises PATCH");
    console.error(`  Should update metric from ${thruster.metric} to ${goblet.metric}`);
    console.error(`  Mutant uses wrong metric`);
    process.exit(1);
  }

  const body = patches[0].body as { exercises?: { metric: string } };
  const patchedMetric = body.exercises?.metric;

  if (!patchedMetric) {
    console.error("✗ FAIL: PATCH doesn't update metric");
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  if (patchedMetric !== goblet.metric) {
    console.error("✗ FAIL: METRIC-ensure - wrong metric in PATCH");
    console.error(`  Expected: ${goblet.metric} (from catalogue)`);
    console.error(`  Got:      ${patchedMetric}`);
    console.error(`  Mutant didn't use catalogue metric`);
    process.exit(1);
  }

  console.log("✓ PASS: METRIC-ensure killed - catalogue metric used");
  console.log(`  Session had wrong metric: ${thruster.metric}`);
  console.log(`  PATCH updated to:         ${goblet.metric}`);
})();
