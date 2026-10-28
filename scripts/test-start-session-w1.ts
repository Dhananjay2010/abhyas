#!/usr/bin/env npx tsx
/**
 * M10/W1: start-session cleanup removed
 * 
 * Mutant: `const cleaned = { rows: plannedForCleaning, changed: false };`
 * (applyBannedCleanup call removed in start-session-full-deps.ts)
 * 
 * Test: Create a program with banned exercise (kettlebell-thruster for current-knee).
 * Call startSessionFullDeps through createFakeDb. Assert returned exercises don't include banned.
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

console.log("Testing M10/W1: start-session cleanup call in start-session-full-deps\n");

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
      exercise_id: thruster.id, // BANNED for current-knee
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    }],
    sessions: [],
    session_exercises: [],
  });

  const result = await startSessionFullDeps(
    fake.client,
    "u1",
    "2024-01-15",
    "weights",
    Date.now()
  );

  if (!result.ok) {
    console.error("✗ FAIL: startSessionFullDeps failed");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  // Check that inserted session_exercises don't include the banned thruster
  const inserts = fake.requests.filter(
    r => r.method === "POST" && r.table === "session_exercises"
  );

  if (inserts.length === 0) {
    console.error("✗ FAIL: No session_exercises inserted");
    process.exit(1);
  }

  const insertedIds = inserts.flatMap(r => r.body as Array<{ exercise_id: string }>).map(e => e.exercise_id);

  if (insertedIds.includes(thruster.id)) {
    console.error("✗ FAIL: M10/W1 - banned exercise (kettlebell-thruster) was inserted");
    console.error(`  Planned had: ${thruster.slug} (${thruster.id})`);
    console.error(`  Should have been replaced, but mutant skipped cleanup`);
    process.exit(1);
  }

  console.log("✓ PASS: M10/W1 killed - banned exercise was cleaned");
  console.log(`  Planned had: kettlebell-thruster (${thruster.id})`);
  console.log(`  Inserted exercises: ${insertedIds.length} (no banned)`);
})();
