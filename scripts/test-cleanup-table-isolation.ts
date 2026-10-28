#!/usr/bin/env npx tsx
/**
 * Test W6: cleanBannedPlannedExercises only touches program_day_exercises.
 * 
 * Must ✗ FAIL if updates/deletes hit sessions or session_exercises tables.
 * Verifies table isolation: cleanup should never touch logged data.
 */

import { readFileSync } from "fs";
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

console.log("Testing cleanup table isolation (W6)\n");

const tablesAccessed: string[] = [];

type FakeQueryBuilder = {
  select: (...args: string[]) => FakeQueryBuilder;
  eq: (...args: unknown[]) => FakeQueryBuilder;
  in: (...args: unknown[]) => FakeQueryBuilder;
  maybeSingle: () => Promise<{ data: unknown }>;
  then: <T>(resolve: (value: { data: unknown }) => T) => Promise<T>;
  update: (data: unknown) => FakeUpdateBuilder;
  delete: () => FakeDeleteBuilder;
};

type FakeUpdateBuilder = {
  eq: (...args: unknown[]) => FakeUpdateBuilder;
  select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
};

type FakeDeleteBuilder = {
  eq: (...args: unknown[]) => { error: unknown };
};

// Fake Supabase that tracks table access
const fakeClient: { from: (table: string) => FakeQueryBuilder } = {
  from(table: string): FakeQueryBuilder {
    const builder: FakeQueryBuilder = {
      select(..._: string[]) { return builder; },
      eq(..._: unknown[]) { return builder; },
      in(..._: unknown[]) { return builder; },
      
      async maybeSingle() {
        tablesAccessed.push(`${table}:read`);
        if (table === "profiles") {
          return {
            data: {
              goal: "muscle_gain",
              level: "beginner",
              primary_track: "weights",
              days_per_week: 4,
              yoga_days_per_week: 0,
              has_all_equipment: true,
            },
          };
        }
        if (table === "programs") {
          return { data: { id: "prog1", status: "active" } };
        }
        return { data: null };
      },
      
      async then<T>(resolve: (value: { data: unknown }) => T) {
        tablesAccessed.push(`${table}:read`);
        if (table === "user_injuries") {
          return resolve({ data: [{ body_region: "knee", severity: "current" }] });
        }
        if (table === "exercises") {
          return resolve({ data: catalogueRows });
        }
        if (table === "user_equipment") {
          return resolve({ data: [{ equipment_id: "kettlebell" }] });
        }
        if (table === "program_days") {
          return resolve({ data: [{ id: "pd1" }] });
        }
        if (table === "program_day_exercises") {
          return resolve({
            data: [{
              id: "pde1",
              exercise_id: thruster.id,
              order_index: 0,
              target_sets: 3,
              target_reps_min: 8,
              target_reps_max: 12,
              rest_seconds: 90,
              program_day_id: "pd1",
            }],
          });
        }
        return resolve({ data: [] });
      },
      
      update(_: unknown): FakeUpdateBuilder {
        tablesAccessed.push(`${table}:update`);
        const updateBuilder: FakeUpdateBuilder = {
          eq: (..._: unknown[]) => updateBuilder,
          select: () => ({ single: async () => ({ data: null, error: null }) }),
        };
        return updateBuilder;
      },
      
      delete(): FakeDeleteBuilder {
        tablesAccessed.push(`${table}:delete`);
        return {
          eq: (..._: unknown[]) => ({ error: null }),
        };
      },
    };
    return builder;
  },
};

(async () => {
  const { cleanBannedPlannedExercises } = await import("../src/lib/program/clean-banned-planned");
  
  await cleanBannedPlannedExercises(fakeClient, "user1");
  
  // Check that only program_day_exercises was written to
  const writeTables = tablesAccessed.filter(a => a.includes(":update") || a.includes(":delete"));
  const illegalWrites = writeTables.filter(t => !t.startsWith("program_day_exercises:"));
  
  if (illegalWrites.length > 0) {
    console.error("✗ FAIL: cleanBannedPlannedExercises touched logged data tables");
    console.error(`  Illegal writes: ${illegalWrites.join(", ")}`);
    console.error("  Should only update/delete program_day_exercises");
    process.exit(1);
  }
  
  if (!writeTables.some(t => t === "program_day_exercises:update" || t === "program_day_exercises:delete")) {
    console.error("✗ FAIL: cleanBannedPlannedExercises did not update program_day_exercises");
    console.error(`  Write operations: ${writeTables.join(", ")}`);
    process.exit(1);
  }
  
  console.log("✓ PASS: W6 killed - cleanup touches only program_day_exercises");
  console.log(`  Write operations: ${writeTables.join(", ")}`);
})();
