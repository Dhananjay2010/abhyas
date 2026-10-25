#!/usr/bin/env tsx
/**
 * Test: insertSessionExercises with two concurrent starts (L2).
 * 
 * In a two-tab race where both tabs try to start a session, the loser of the
 * `sessions` insert gets a 23505 and startSessionCore returns the winner's
 * session id. Both tabs then try to insert exercises for that session. Without
 * the idempotent upsert, the second insert would get a duplicate-key error on
 * session_exercises_session_id_order_index_key.
 * 
 * This test verifies that insertSessionExercises handles concurrent inserts
 * correctly via upsert with ignoreDuplicates, so both tabs get success.
 */
import { createFakeDb, type FakeDb } from "./helpers/fake-postgrest";
import { insertSessionExercises, type SessionExerciseInsert } from "../src/lib/session/insert-session-exercises";

export {};

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function eq<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function db(): FakeDb {
  return createFakeDb({
    tables: { session_exercises: [] },
    unique: [{ table: "session_exercises", columns: ["session_id", "order_index"] }],
  });
}

const sampleExercises = (sessionId: string): SessionExerciseInsert[] => [
  {
    session_id: sessionId,
    user_id: "user-1",
    exercise_id: "ex-1",
    order_index: 0,
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 120,
    metric: "reps" as const,
  },
  {
    session_id: sessionId,
    user_id: "user-1",
    exercise_id: "ex-2",
    order_index: 1,
    planned_sets: 3,
    planned_reps_min: 10,
    planned_reps_max: 15,
    rest_seconds: 90,
    metric: "reps" as const,
  },
];

async function main() {
  console.log("Testing insertSessionExercises\n");

  await test("first insert succeeds and creates rows", async () => {
    const fake = db();
    const exercises = sampleExercises("session-1");
    const result = await insertSessionExercises(fake.client, exercises);
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    eq(fake.tables.session_exercises.length, 2, "exercise rows created");
  });

  await test("empty exercises array is a no-op success", async () => {
    const fake = db();
    const result = await insertSessionExercises(fake.client, []);
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    eq(fake.tables.session_exercises.length, 0, "no rows created");
  });

  await test("second insert of same exercises succeeds (idempotent)", async () => {
    const fake = db();
    const exercises = sampleExercises("session-2");
    
    const first = await insertSessionExercises(fake.client, exercises);
    if (!first.ok) throw new Error(`first insert failed: ${first.error}`);
    eq(fake.tables.session_exercises.length, 2, "first insert created 2 rows");

    const second = await insertSessionExercises(fake.client, exercises);
    if (!second.ok) throw new Error(`second insert failed: ${second.error}`);
    eq(fake.tables.session_exercises.length, 2, "second insert is a no-op (idempotent)");
  });

  await test("concurrent inserts both succeed (two-tab race)", async () => {
    const fake = db();
    const exercises = sampleExercises("session-3");
    
    // Simulate two tabs racing to insert exercises for the same session.
    // Both inserts run concurrently (Promise.all). The first one to commit
    // creates the rows; the second one hits the unique constraint but succeeds
    // due to ignoreDuplicates.
    const [result1, result2] = await Promise.all([
      insertSessionExercises(fake.client, exercises),
      insertSessionExercises(fake.client, exercises),
    ]);

    if (!result1.ok) throw new Error(`tab 1 failed: ${result1.error}`);
    if (!result2.ok) throw new Error(`tab 2 failed: ${result2.error}`);
    eq(fake.tables.session_exercises.length, 2, "only 2 rows exist (not 4)");
  });

  await test("insert with different session_id creates separate rows", async () => {
    const fake = db();
    const exercises1 = sampleExercises("session-a");
    const exercises2 = sampleExercises("session-b");
    
    const first = await insertSessionExercises(fake.client, exercises1);
    if (!first.ok) throw new Error(`first insert failed: ${first.error}`);
    
    const second = await insertSessionExercises(fake.client, exercises2);
    if (!second.ok) throw new Error(`second insert failed: ${second.error}`);
    
    eq(fake.tables.session_exercises.length, 4, "both sessions have their exercises");
  });

  await test("P6: insert error is returned, not swallowed", async () => {
    const fake = db();
    const exercises = sampleExercises("session-fail");
    
    // Inject a server error via beforeRequest
    fake.beforeRequest = (req) => {
      if (req.method === "POST" && req.table === "session_exercises") {
        return new Response(JSON.stringify({
          code: "42501",
          message: "insufficient_privilege",
          details: "permission denied for table session_exercises",
          hint: null,
        }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    };
    
    const result = await insertSessionExercises(fake.client, exercises);
    if (result.ok) throw new Error("expected error, got ok");
    if (!result.error.includes("insufficient_privilege")) {
      throw new Error(`expected "insufficient_privilege" error, got: ${result.error}`);
    }
  });

  await test("BUG CATCH: upsert uses onConflict with ignoreDuplicates", async () => {
    const fake = db();
    const exercises = sampleExercises("session-conflict");

    let isUpsert = false;
    fake.beforeRequest = (req) => {
      if (req.method === "POST" && req.table === "session_exercises") {
        isUpsert = req.prefer.includes("resolution=ignore-duplicates");
      }
    };

    await insertSessionExercises(fake.client, exercises);

    if (!isUpsert) {
      throw new Error("Expected upsert with ignoreDuplicates (resolution=ignore-duplicates in Prefer header)");
    }
  });

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
