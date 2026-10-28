#!/usr/bin/env npx tsx
/**
 * Metric fix: Ensure session must use replacement's metric.
 * 
 * Mutant: Don't update metric when replacing banned exercise in ensure path.
 * Example: one-leg-barbell-squat (reps) → wall-sit (seconds), must use seconds.
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

// Find an exercise that gets replaced with different metric
const barbell = catalogue.find(e => e.slug === "one-leg-barbell-squat");
const wallSit = catalogue.find(e => e.slug === "wall-sit");

if (!barbell || !wallSit) {
  console.error("✗ FAIL: Test exercises not found");
  process.exit(1);
}

const bMetric = barbell.metric;
const wMetric = wallSit.metric;

console.log("Testing metric fix: ensure session\n");
console.log(`  Original: ${barbell.slug} (${bMetric})`);
console.log(`  Replacement: ${wallSit.slug} (${wMetric})`);

if (bMetric === wMetric) {
  console.log("⊘ SKIP: Metrics are the same, test not applicable");
  process.exit(0);
}

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
        exercise_id: barbell.id,
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

  const first = insertedExercises[0] as { exercise_id: string; metric: string };
  const catalogueEntry = catalogue.find(e => e.id === first.exercise_id);

  if (!catalogueEntry) {
    console.error("✗ FAIL: Replacement not found in catalogue");
    process.exit(1);
  }

  if (first.metric !== catalogueEntry.metric) {
    console.error("✗ FAIL: Metric fix - Ensure session uses wrong metric");
    console.error(`  Mutant: Don't update metric when replacing in ensure`);
    console.error(`  Exercise: ${catalogueEntry.slug} (${catalogueEntry.id})`);
    console.error(`  Catalogue metric: ${catalogueEntry.metric}`);
    console.error(`  Inserted metric:  ${first.metric}`);
    process.exit(1);
  }

  console.log("✓ PASS: Metric fix - Ensure uses replacement's metric");
  console.log(`  Replacement:      ${catalogueEntry.slug}`);
  console.log(`  Catalogue metric: ${catalogueEntry.metric}`);
  console.log(`  Inserted metric:  ${first.metric} ✓`);
})();
