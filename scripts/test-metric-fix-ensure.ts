#!/usr/bin/env npx tsx
/**
 * Metric fix: Ensure session must use replacement's metric.
 * 
 * Mutant: Don't update metric when replacing banned exercise in ensure path.
 * Example: one-leg-barbell-squat (reps) → wall-sit (seconds), must use seconds.
 */

import { readFileSync } from "fs";
import { ensureSessionExercises } from "../src/lib/session/ensure-session-exercises";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

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

let insertedExercises: unknown[] = [];

function makeFakeSupabase() {
  return {
    from(table: string) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        order() { return builder; },
        async maybeSingle() {
          if (table === "sessions") {
            return {
              data: {
                program_day_id: "pd1",
                actual_type: "weights",
                is_deload: false,
                session_exercises: [], // 0 existing
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        async then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          if (table === "program_day_exercises") {
            return resolve({
              data: [{
                id: "pde1",
                exercise_id: barbell!.id,
                order_index: 0,
                target_sets: 3,
                target_reps_min: 8,
                target_reps_max: 12,
                rest_seconds: 90,
                exercises: { metric: barbell!.metric },
              }],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        },
        insert(data: unknown) {
          if (table === "session_exercises") {
            insertedExercises = Array.isArray(data) ? data : [data];
          }
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
  };
}

const fakeClient = makeFakeSupabase();

(async () => {
await ensureSessionExercises(
  fakeClient as Pick<SupabaseClient<Database>, "from">,
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

if (insertedExercises.length === 0) {
  console.error("✗ FAIL: No exercises inserted");
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
