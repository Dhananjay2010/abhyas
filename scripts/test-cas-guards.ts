#!/usr/bin/env npx tsx
/**
 * CAS guards: Update and delete must filter on exercise_id.
 * 
 * CAS mutants:
 * - Remove .eq("exercise_id", originalExerciseId) from update
 * - Remove .eq("exercise_id", originalExerciseId) from delete
 * 
 * This test verifies both filters are present by checking the query builders.
 */

import { readFileSync } from "fs";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

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

console.log("Testing CAS guards: update and delete filters\n");

(async () => {
const { cleanBannedPlannedExercises } = await import("../src/lib/program/clean-banned-planned");

const updateFilters: Array<{ column: string; value: unknown }> = [];
const deleteFilters: Array<{ column: string; value: unknown }> = [];

const fakeClient = {
  from(table: string) {
    let isUpdate = false;
    let isDelete = false;
    
    const builder: Record<string, unknown> = {
      select() { return builder; },
      eq(column: string, value: unknown) { 
        if (table === "program_day_exercises") {
          if (isUpdate) {
            updateFilters.push({ column, value });
          } else if (isDelete) {
            deleteFilters.push({ column, value });
          }
        }
        return builder;
      },
      in() { return builder; },
      async then(resolve: (value: { data: unknown[] }) => unknown) {
        if (table === "profiles") {
          return resolve({
            data: [{
              goal: "muscle_gain",
              level: "beginner",
              primary_track: "weights",
              days_per_week: 4,
              yoga_days_per_week: 0,
              has_all_equipment: true,
            }],
          });
        }
        if (table === "programs") {
          return resolve({ data: [{ id: "prog1", status: "active" }] });
        }
        if (table === "user_injuries") {
          return resolve({ data: [{ body_region: "knee", severity: "current" }] });
        }
        if (table === "exercises") {
          return resolve({ data: catalogueRows });
        }
        if (table === "user_equipment") {
          const allIds = catalogue.flatMap(e => e.equipment_ids);
          return resolve({ data: allIds.map(id => ({ equipment_id: id })) });
        }
        if (table === "program_days") {
          return resolve({ data: [{ id: "pd1" }] });
        }
        if (table === "program_day_exercises") {
          return resolve({
            data: [{
              id: "pde1",
              exercise_id: thruster.id,
              program_day_id: "pd1",
              order_index: 0,
              target_sets: 3,
              target_reps_min: 8,
              target_reps_max: 12,
              rest_seconds: 90,
            }],
          });
        }
        return resolve({ data: [] });
      },
      update() {
        isUpdate = true;
        return builder;
      },
      delete() {
        isDelete = true;
        return builder;
      },
    };
    return builder;
  },
};

await cleanBannedPlannedExercises(fakeClient as Pick<SupabaseClient<Database>, "from">, "u1");

// Check update has both id and exercise_id filters
const updateHasId = updateFilters.some(f => f.column === "id");
const updateHasExerciseId = updateFilters.some(f => f.column === "exercise_id");

if (!updateHasId || !updateHasExerciseId) {
  console.error("✗ FAIL: CAS - Update missing required filters");
  console.error(`  CAS mutant: .eq("exercise_id", originalExerciseId) removed from update`);
  console.error(`  Expected: both id and exercise_id filters`);
  console.error(`  Update filters:`, updateFilters);
  process.exit(1);
}

// Check delete has both id and exercise_id filters
const deleteHasId = deleteFilters.some(f => f.column === "id");
const deleteHasExerciseId = deleteFilters.some(f => f.column === "exercise_id");

if (!deleteHasId || !deleteHasExerciseId) {
  console.error("✗ FAIL: CAS - Delete missing required filters");
  console.error(`  CAS mutant: .eq("exercise_id", originalExerciseId) removed from delete`);
  console.error(`  Expected: both id and exercise_id filters`);
  console.error(`  Delete filters:`, deleteFilters);
  process.exit(1);
}

console.log("✓ PASS: CAS guards present on both update and delete");
console.log(`  Update filters: ${updateFilters.map(f => f.column).join(", ")}`);
console.log(`  Delete filters: ${deleteFilters.map(f => f.column).join(", ")}`);
})();
