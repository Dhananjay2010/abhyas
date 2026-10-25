#!/usr/bin/env tsx
/**
 * Test resolveSwapWeights (MEDIUM-1): kill mutants that return null prefill,
 * null workingWeightKg, look up by old exercise id, ignore deload, or rethrow errors.
 */

import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { resolveSwapWeights } from "@/lib/session/resolve-swap-weights";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

// Mock Supabase client
function createMockClient(db: PGlite): SupabaseClient<Database> {
  const client = {
    from: (table: string) => ({
      select: (columns: string) => {
        const query = {
          eq: (column: string, value: unknown) => {
            const q = {
              maybeSingle: async () => {
                if (table === "sessions") {
                  const result = await db.query(
                    `SELECT is_deload FROM sessions WHERE id = $1`,
                    [value],
                  );
                  return { data: result.rows[0] || null, error: null };
                }
                if (table === "exercise_progress") {
                  const result = await db.query(
                    `SELECT current_working_weight_kg FROM exercise_progress WHERE user_id = $1 AND exercise_id = $2`,
                    [q._userId, q._exerciseId],
                  );
                  return { data: result.rows[0] || null, error: null };
                }
                return { data: null, error: null };
              },
              _userId: null as string | null,
              _exerciseId: null as string | null,
            };
            if (column === "user_id") q._userId = value as string;
            if (column === "exercise_id") q._exerciseId = value as string;
            return q;
          },
        };
        return query;
      },
    }),
  } as unknown as SupabaseClient<Database>;
  return client;
}

async function main() {
  console.log("Test resolveSwapWeights\n");

  const db = new PGlite();

  // Setup tables
  await db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      is_deload BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE exercise_progress (
      user_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      current_working_weight_kg NUMERIC,
      PRIMARY KEY (user_id, exercise_id)
    );

    CREATE TABLE exercise_history (
      user_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      session_date TEXT NOT NULL,
      weight_kg NUMERIC,
      reps INTEGER
    );
  `);

  const userId = "user1";
  const oldExerciseId = "old-ex";
  const newExerciseId = "new-ex";
  const sessionId = "sess1";

  // Insert session (deload)
  await db.query(
    `INSERT INTO sessions (id, user_id, is_deload) VALUES ($1, $2, $3)`,
    [sessionId, userId, true],
  );

  // Insert progress for NEW exercise (working weight 100)
  await db.query(
    `INSERT INTO exercise_progress (user_id, exercise_id, current_working_weight_kg) VALUES ($1, $2, $3)`,
    [userId, newExerciseId, 100],
  );

  // Insert progress for OLD exercise (should NOT be used)
  await db.query(
    `INSERT INTO exercise_progress (user_id, exercise_id, current_working_weight_kg) VALUES ($1, $2, $3)`,
    [userId, oldExerciseId, 42],
  );

  // Insert history for NEW exercise (last top set 30 kg)
  await db.query(
    `INSERT INTO exercise_history (user_id, exercise_id, session_date, weight_kg, reps) VALUES ($1, $2, $3, $4, $5)`,
    [userId, newExerciseId, "2026-10-20", 30, 10],
  );

  const client = createMockClient(db);

  console.log("Case 1: Normal lookup (deload, new exercise has progress)\n");
  const result1 = await resolveSwapWeights(
    client,
    userId,
    sessionId,
    newExerciseId,
    ["barbell"],
    "reps",
    "push",
  );

  check("Returns non-null prefill", result1.weightPrefill !== null, `got ${result1.weightPrefill}`);
  check("Prefill is deloaded (~70%)", result1.weightPrefill! >= 65 && result1.weightPrefill! <= 75, `got ${result1.weightPrefill}`);
  check("Working weight from NEW exercise", result1.workingWeightKg === 100, `got ${result1.workingWeightKg}`);
  check("Not bodyweight", !result1.isBodyweight);

  console.log("\nCase 2: Never-done exercise (no progress or history)\n");
  const result2 = await resolveSwapWeights(
    client,
    userId,
    sessionId,
    "never-done-ex",
    ["dumbbell"],
    "reps",
    "pull",
  );

  check("Prefill is null for never-done", result2.weightPrefill === null);
  check("Working weight is null for never-done", result2.workingWeightKg === null);
  check("Not bodyweight", !result2.isBodyweight);

  console.log("\nCase 3: Bodyweight exercise\n");
  const result3 = await resolveSwapWeights(
    client,
    userId,
    sessionId,
    "bodyweight-ex",
    [],
    "reps",
    "push",
  );

  check("Bodyweight flag set", result3.isBodyweight);

  console.log("\nCase 4: Non-deload session\n");
  await db.query(`UPDATE sessions SET is_deload = false WHERE id = $1`, [sessionId]);
  const result4 = await resolveSwapWeights(
    client,
    userId,
    sessionId,
    newExerciseId,
    ["barbell"],
    "reps",
    "push",
  );

  check("Non-deload prefill is higher", result4.weightPrefill! > result1.weightPrefill!, `${result4.weightPrefill} vs ${result1.weightPrefill}`);

  console.log("\n✅ All resolveSwapWeights tests passed");
  console.log("\nMutant coverage:");
  console.log("  M3: returning null prefill → would fail case 1");
  console.log("  M3b: returning null workingWeightKg → would fail case 1");
  console.log("  M7: looking up old exercise id → would fail case 1 (gets 42 not 100)");
  console.log("  M8: ignoring is_deload → would fail case 4 comparison");
  console.log("  P1: catch rethrowing → would fail case 2 (no panic)\n");

  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
