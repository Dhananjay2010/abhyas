#!/usr/bin/env npx tsx
/**
 * H2-unwired/W3: ensureSessionExercises must replace banned exercises.
 * 
 * H2 mutant: ensureSessionExercises not wired (no cleanup call).
 * W3 mutant: cleanup no-op in ensureSessionExercises.
 * This test calls buildStartSessionFullDeps(fake).ensureSessionExercises(sessionId)
 * with 0 existing session_exercises and a planned day containing banned slug.
 */

import { readFileSync } from "fs";
import { buildStartSessionFullDeps } from "../src/lib/session/start-session-full-deps";
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

console.log("Testing H2/W3: ensureSessionExercises must replace banned\n");

type QueryResponse<T> = { data: T; error: null };

let insertedExercises: unknown[] = [];

function makeFakeSupabase(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        order() {
          return builder;
        },
        async maybeSingle(): Promise<QueryResponse<unknown>> {
          const rows = tables[table] || [];
          return { data: rows[0] || null, error: null };
        },
        async single(): Promise<QueryResponse<unknown>> {
          const rows = tables[table] || [];
          return { data: rows[0] || null, error: null };
        },
        async then<T>(resolve: (value: QueryResponse<unknown[]>) => T): Promise<T> {
          const rows = tables[table] || [];
          return resolve({ data: rows, error: null });
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

const fakeTables = {
  profiles: [
    {
      id: "u1",
      goal: "muscle_gain",
      level: "beginner",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      has_all_equipment: true,
    },
  ],
  programs: [
    {
      id: "prog1",
      user_id: "u1",
      status: "active",
      started_on: "2024-01-01",
      deload_week: 4,
      week_offset: 0,
    },
  ],
  sessions: [
    {
      id: "s1",
      user_id: "u1",
      program_id: "prog1",
      program_day_id: "pd1",
      local_date: "2024-01-15",
      status: "in_progress",
      started_at: "2024-01-15T10:00:00Z",
      actual_type: "strength",
    },
  ],
  session_exercises: [], // 0 existing
  user_injuries: [
    { body_region: "knee", severity: "current" },
  ],
  exercises: catalogueRows,
  user_equipment: catalogue.flatMap(e => e.equipment_ids).map(id => ({ equipment_id: id })),
  program_days: [
    {
      id: "pd1",
      program_id: "prog1",
      day_index: 1,
      day_type: "strength",
      status: "active",
    },
  ],
  program_day_exercises: [
    {
      id: "pde1",
      program_day_id: "pd1",
      exercise_id: thruster.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: { metric: "reps" },
    },
  ],
};

const fakeClient = makeFakeSupabase(fakeTables);

const deps = buildStartSessionFullDeps(fakeClient as never, "u1", Date.now());

(async () => {
  await deps.ensureSessionExercises("s1");
  
  if (insertedExercises.length === 0) {
    console.error("✗ FAIL: No session exercises inserted");
    process.exit(1);
  }
  
  const first = insertedExercises[0] as { exercise_id: string };
  
  if (first.exercise_id === thruster.id) {
    console.error("✗ FAIL: H2/W3 - inserted banned exercise (not replaced)");
    console.error(`  H2 mutant: ensureSessionExercises not wired to cleanup`);
    console.error(`  W3 mutant: cleanup no-op in ensureSessionExercises`);
    console.error(`  Expected replacement, got banned: kettlebell-thruster (${thruster.id})`);
    process.exit(1);
  }
  
  const replacement = catalogue.find(e => e.id === first.exercise_id);
  
  console.log("✓ PASS: H2/W3 killed - ensureSessionExercises replaced banned exercise");
  console.log(`  Session:     s1 (0 existing exercises)`);
  console.log(`  Banned:      kettlebell-thruster (${thruster.id})`);
  console.log(`  Replacement: ${replacement?.slug || 'unknown'} (${first.exercise_id})`);
})();
