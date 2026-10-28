#!/usr/bin/env npx tsx
/**
 * METRIC-ensure: ensureSessionExercises must stamp the replacement's metric.
 *
 * Mutant: 'const metric = metricOf(p.exercises); // MUTANT: catalogue metric ignored'
 *         in src/lib/session/ensure-session-exercises.ts
 *
 * Restored from e41cff33 (real ensureSessionExercises path, inserted metric
 * compared with the catalogue) and made non-vacuous: e41cff33's full
 * catalogue swapped one-leg-barbell-squat for spanish-squat (reps -> reps), so
 * the metric never changed and the mutant survived. Here the catalogue holds
 * only the banned squat and wall-sit, so the replacement is a timed hold
 * (reps -> seconds), and the embedded planned row says "reps", the way PostgREST
 * would return it. Ignoring the catalogue metric then inserts "reps".
 * The 3268d1d0 applyBannedCleanup pass-through check is kept in part 2.
 */

import { readFileSync } from "fs";
import { createFakeDb, json } from "./helpers/fake-postgrest";
import { ensureSessionExercises } from "../src/lib/session/ensure-session-exercises";
import { applyBannedCleanup } from "../src/lib/program/apply-banned-cleanup";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const fullCatalogue = toCandidateExercises(catalogueRows);

// Find an exercise that gets replaced with different metric
const barbell = fullCatalogue.find(e => e.slug === "one-leg-barbell-squat");
const wallSit = fullCatalogue.find(e => e.slug === "wall-sit");

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
  // A skip is never a pass: without differing metrics the test proves nothing.
  console.error("✗ FAIL: fixture metrics are the same, test would be vacuous");
  process.exit(1);
}

// Only the banned squat and the timed hold: the swap must be wall-sit.
const catalogue = [barbell, wallSit];

type Enums = Database["public"]["Enums"];
const profile: {
  goal: Enums["fitness_goal"];
  level: Enums["fitness_level"];
  primary_track: Enums["track_type"];
  days_per_week: number;
  yoga_days_per_week: number;
  has_all_equipment: boolean;
} = {
  goal: "muscle_gain",
  level: "beginner",
  primary_track: "weights",
  days_per_week: 4,
  yoga_days_per_week: 0,
  has_all_equipment: true,
};

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
  // PostgREST embeds the planned exercise's own metric; fake-postgrest does not
  // resolve embeds, so answer the planned-rows GET with that shape.
  fake.beforeRequest = (req) => {
    if (req.table !== "program_day_exercises" || req.method !== "GET") return;
    if (req.filters.program_day_id !== "eq.pd1") return;
    return json(200, [{
      id: "pde1", exercise_id: barbell.id, order_index: 0, target_sets: 3, target_reps_min: 8,
      target_reps_max: 12, rest_seconds: 90, exercises: { metric: bMetric },
    }]);
  };

  await ensureSessionExercises(
    fake.client,
    "u1",
    "s1",
    catalogue,
    profile,
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
  const catalogueEntry = fullCatalogue.find(e => e.id === first.exercise_id);

  if (!catalogueEntry) {
    console.error("✗ FAIL: Replacement not found in catalogue");
    process.exit(1);
  }

  if (catalogueEntry.id !== wallSit.id) {
    console.error(`✗ FAIL: Expected the banned squat to be replaced by ${wallSit.slug}, got ${catalogueEntry.slug}`);
    process.exit(1);
  }

  if (first.metric !== catalogueEntry.metric) {
    console.error("✗ FAIL: Metric fix - Ensure session uses wrong metric");
    console.error(`  Mutant: Don't update metric when replacing in ensure`);
    console.error(`  Exercise: ${catalogueEntry.slug} (${catalogueEntry.id})`);
    console.error(`  Catalogue metric: ${catalogueEntry.metric}`);
    console.error(`  Inserted metric:  ${String(first.metric)}`);
    process.exit(1);
  }

  console.log("✓ PASS: Metric fix - Ensure uses replacement's metric");
  console.log(`  Replacement:      ${catalogueEntry.slug}`);
  console.log(`  Catalogue metric: ${catalogueEntry.metric}`);
  console.log(`  Inserted metric:  ${String(first.metric)} ✓`);

  // Part 2 (kept from 3268d1d0): a non-banned timed hold passes through cleanup.
  const plank = fullCatalogue.find(e => e.slug === "plank");
  if (!plank || plank.metric !== "seconds") {
    console.error("✗ FAIL: plank not found or wrong metric");
    process.exit(1);
  }
  const result = applyBannedCleanup(
    [{
      id: "pde1",
      exercise_id: plank.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    }],
    [plank],
    profile,
    [],
    "u1",
    []
  );
  if (result.rows.length === 0 || result.rows[0].exercise_id !== plank.id) {
    console.error("✗ FAIL: METRIC-ensure - unexpected result");
    process.exit(1);
  }
  console.log(`✓ PASS: ${plank.slug} (metric: ${plank.metric}) passes through cleanup unchanged`);
})();
