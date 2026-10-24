#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Test ensureSessionExercises with a mock Supabase client
 * to verify it respects the is_deload flag from the session.
 */

import { ensureSessionExercises } from "../src/app/session/actions.js";

interface MockSession {
  program_day_id: string;
  actual_type: string;
  is_deload?: boolean;
  session_exercises: Array<{ id: string }>;
}

interface MockProgramDayExercise {
  exercise_id: string;
  order_index: number;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number;
  exercises: { metric: string };
}

interface InsertedRow {
  session_id: string;
  user_id: string;
  exercise_id: string;
  order_index: number;
  planned_sets: number;
  planned_reps_min: number;
  planned_reps_max: number;
  rest_seconds: number;
  metric: string;
}

function createMockSupabase(
  sessionData: MockSession,
  programDayExercises: MockProgramDayExercise[],
  insertedRows: InsertedRow[],
) {
  return {
    from(table: string) {
      if (table === "sessions") {
        return {
          select(fields: string) {
            if (!fields.includes("is_deload")) {
              throw new Error(
                "TEST ASSERTION FAILED: sessions query must include is_deload field",
              );
            }
            return {
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({ data: sessionData, error: null });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "program_day_exercises") {
        return {
          select(_fields: string) {
            return {
              eq(_field: string, _value: string) {
                return {
                  order(_orderField: string) {
                    return Promise.resolve({
                      data: programDayExercises,
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "session_exercises") {
        return {
          insert(rows: InsertedRow[]) {
            insertedRows.push(...rows);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

async function runTests() {
  console.log("Testing ensureSessionExercises with deload context...\n");

  // Test 1: is_deload=true should reduce sets
  {
    const insertedRows: InsertedRow[] = [];
    const mockSupabase = createMockSupabase(
      {
        program_day_id: "day1",
        actual_type: "weights",
        is_deload: true,
        session_exercises: [],
      },
      [
        {
          exercise_id: "ex1",
          order_index: 0,
          target_sets: 5,
          target_reps_min: 8,
          target_reps_max: 12,
          rest_seconds: 120,
          exercises: { metric: "reps" },
        },
        {
          exercise_id: "ex2",
          order_index: 1,
          target_sets: 4,
          target_reps_min: 10,
          target_reps_max: 15,
          rest_seconds: 90,
          exercises: { metric: "reps" },
        },
      ],
      insertedRows,
    );

    await ensureSessionExercises(mockSupabase, "user1", "sess1");

    if (insertedRows.length !== 2) {
      throw new Error(`Expected 2 exercises, got ${insertedRows.length}`);
    }

    if (insertedRows[0].planned_sets !== 3) {
      throw new Error(
        `Expected ex1 to have 3 sets with deload, got ${insertedRows[0].planned_sets}`,
      );
    }

    if (insertedRows[1].planned_sets !== 2) {
      throw new Error(
        `Expected ex2 to have 2 sets with deload, got ${insertedRows[1].planned_sets}`,
      );
    }

    console.log("  ✓  is_deload=true: sets reduced 5→3, 4→2");
  }

  // Test 2: is_deload=false should keep original sets
  {
    const insertedRows: InsertedRow[] = [];
    const mockSupabase = createMockSupabase(
      {
        program_day_id: "day1",
        actual_type: "weights",
        is_deload: false,
        session_exercises: [],
      },
      [
        {
          exercise_id: "ex1",
          order_index: 0,
          target_sets: 5,
          target_reps_min: 8,
          target_reps_max: 12,
          rest_seconds: 120,
          exercises: { metric: "reps" },
        },
      ],
      insertedRows,
    );

    await ensureSessionExercises(mockSupabase, "user1", "sess2");

    if (insertedRows[0].planned_sets !== 5) {
      throw new Error(
        `Expected ex1 to have 5 sets without deload, got ${insertedRows[0].planned_sets}`,
      );
    }

    console.log("  ✓  is_deload=false: sets unchanged (5→5)");
  }

  console.log("\n✅ All ensureSessionExercises mock tests passed");
}

runTests().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  process.exit(1);
});
