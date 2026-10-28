#!/usr/bin/env npx tsx
/**
 * METRIC-start: Metric not updated when starting session
 * 
 * Mutant: Don't update metric from catalogue in start-session-full-deps.ts
 * 
 * Test: Start session with banned exercise that has wrong metric in planned.
 * Assert inserted session_exercises use replacement's correct metric.
 */

import { readFileSync } from "fs";
import { createFakeDb } from "./helpers/fake-postgrest";
import { startSessionFullDeps } from "../src/lib/session/start-session-full-deps";
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
  console.error("✗ FAIL: test exercises have same metric, can't test replacement");
  process.exit(1);
}

console.log("Testing METRIC-start: Replacement metric in start session\n");

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
      exercise_id: thruster.id, // BANNED, will be replaced with goblet
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    }],
    sessions: [],
    session_exercises: [],
  });

  await startSessionFullDeps(
    fake.client,
    "u1",
    "2024-01-15",
    "weights",
    Date.now()
  );

  // Find INSERT to session_exercises
  const inserts = fake.requests.filter(
    r => r.method === "POST" && r.table === "session_exercises"
  );

  if (inserts.length === 0) {
    console.error("✗ FAIL: No session_exercises inserted");
    process.exit(1);
  }

  const body = inserts[0].body as Array<{ exercises: { metric: string } }>;
  const insertedMetric = body[0]?.exercises?.metric;

  if (!insertedMetric) {
    console.error("✗ FAIL: No metric in inserted session_exercises");
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  if (insertedMetric !== goblet.metric) {
    console.error("✗ FAIL: METRIC-start - wrong metric used");
    console.error(`  Expected: ${goblet.metric} (from replacement goblet-squat)`);
    console.error(`  Got:      ${insertedMetric}`);
    console.error(`  Mutant didn't update metric from catalogue`);
    process.exit(1);
  }

  console.log("✓ PASS: METRIC-start killed - replacement's metric used");
  console.log(`  Banned:      kettlebell-thruster (${thruster.metric})`);
  console.log(`  Replacement: goblet-squat (${goblet.metric})`);
  console.log(`  Inserted with: ${insertedMetric}`);
})();
