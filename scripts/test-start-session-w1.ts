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
import { buildStartSessionFullDeps } from "../src/lib/session/start-session-full-deps";
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
      sessions: [],
      session_exercises: [],
    },
  });

  const deps = buildStartSessionFullDeps(fake.client, "u1", "2024-01-15", "weights", Date.now());
  
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
  
  const cleaned = await deps.cleanBannedExercises(plannedExercises);

  if (cleaned.length === 0) {
    console.error("✗ FAIL: cleanBannedExercises returned empty array");
    process.exit(1);
  }

  const firstId = cleaned[0].exercise_id;

  if (firstId === thruster.id) {
    console.error("✗ FAIL: M10/W1 - banned exercise (kettlebell-thruster) not replaced");
    console.error(`  Planned had: ${thruster.slug} (${thruster.id})`);
    console.error(`  cleanBannedExercises returned same (mutant skipped cleanup)`);
    process.exit(1);
  }

  console.log("✓ PASS: M10/W1 killed - banned exercise was cleaned");
  console.log(`  Planned had: kettlebell-thruster (${thruster.id})`);
  console.log(`  Cleaned to:  ${catalogue.find(e => e.id === firstId)?.slug || 'unknown'} (${firstId})`);
})();
