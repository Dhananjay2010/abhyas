#!/usr/bin/env tsx
/*
 * Test: logSetCore never overwrites a saved set.
 *
 * logSetCore runs against a real supabase-js client whose HTTP calls go to an
 * in-memory PostgREST stand-in (scripts/helpers/fake-postgrest.ts) with the
 * session_sets unique key, so the tests see what the database would: an
 * insert or an upsert, the filters on each read, and a 23505 on a duplicate.
 */

import { logSetCore, type LogSetResult } from "../src/lib/session/log-set-core";
import { createFakeDb, json, type FakeDb, type Row } from "./helpers/fake-postgrest";

export {}; // Make this a module

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function eq<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function setRow(sessionExerciseId: string, setNumber: number, reps: number, weightKg: number, isWarmup = false): Row {
  return {
    id: `seed-${sessionExerciseId}-${setNumber}-${isWarmup}`,
    session_exercise_id: sessionExerciseId,
    user_id: "user-1",
    set_number: setNumber,
    reps,
    weight_kg: weightKg,
    duration_seconds: null,
    is_warmup_set: isWarmup,
    completed_at: "2026-10-24T06:30:00.000Z",
  };
}

function db(rows: Row[] = []): FakeDb {
  return createFakeDb({
    tables: { session_sets: rows },
    unique: [{ table: "session_sets", columns: ["session_exercise_id", "set_number", "is_warmup_set"] }],
  });
}

function working(fake: FakeDb, sessionExerciseId: string, setNumber: number): Row[] {
  return fake.tables.session_sets.filter(
    (r) => r.session_exercise_id === sessionExerciseId && r.set_number === setNumber && r.is_warmup_set === false,
  );
}

function savedSetsOf(result: LogSetResult) {
  if (result.ok || !("reason" in result)) {
    throw new Error(`Expected a set_exists conflict, got ${JSON.stringify(result)}`);
  }
  return result.savedSets;
}

const writes = (fake: FakeDb) => fake.requests.filter((r) => r.table === "session_sets" && r.method !== "GET");

async function main() {
  console.log("Testing logSetCore\n");

  await test("a new set is inserted, never upserted", async () => {
    const fake = db();
    const result = await logSetCore(fake.client, "user-1", {
      sessionExerciseId: "ex-1", setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null,
    });
    eq(result.ok, true, "result.ok");
    const posted = writes(fake);
    eq(posted.length, 1, "write requests");
    eq(posted[0].method, "POST", "write method");
    assert(!posted[0].prefer.includes("resolution="), `insert must not be an upsert (Prefer: ${posted[0].prefer})`);
    const rows = working(fake, "ex-1", 1);
    eq(rows.length, 1, "rows for set 1");
    eq(rows[0].reps, 10, "saved reps");
    eq(rows[0].is_warmup_set, false, "saved as a working set");
  });

  await test("the existing-set lookup is scoped to working sets", async () => {
    // A warm-up set 1 with different values must not block working set 1.
    const fake = db([setRow("ex-2", 1, 5, 40, true)]);
    const result = await logSetCore(fake.client, "user-1", {
      sessionExerciseId: "ex-2", setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null,
    });
    eq(result.ok, true, "result.ok");
    const lookup = fake.requests.find((r) => r.method === "GET" && r.filters.set_number === "eq.1");
    assert(lookup !== undefined, "a lookup of set 1 was made");
    eq(lookup?.filters.is_warmup_set, "eq.false", "lookup filters is_warmup_set");
    eq(working(fake, "ex-2", 1).length, 1, "working set 1 saved");
  });

  await test("an identical replay succeeds without writing again", async () => {
    const fake = db([setRow("ex-3", 1, 10, 60)]);
    const result = await logSetCore(fake.client, "user-1", {
      sessionExerciseId: "ex-3", setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null,
    });
    eq(result.ok, true, "result.ok");
    eq(writes(fake).length, 0, "write requests");
    eq(working(fake, "ex-3", 1).length, 1, "rows for set 1");
  });

  await test("a different value for a saved set is a conflict, and the saved set is kept", async () => {
    const fake = db([setRow("ex-4", 1, 12, 30)]);
    const result = await logSetCore(fake.client, "user-1", {
      sessionExerciseId: "ex-4", setNumber: 1, reps: 8, weightKg: 35, durationSeconds: null,
    });
    const saved = savedSetsOf(result);
    eq(saved.length, 1, "saved sets returned");
    eq(saved[0].reps, 12, "returned saved reps");
    eq(saved[0].weightKg, 30, "returned saved weight");
    eq(writes(fake).length, 0, "write requests");
    eq(working(fake, "ex-4", 1)[0].reps, 12, "stored reps unchanged");
  });

  await test("stale tab: logging set 2 after another tab saved it returns every saved set in order", async () => {
    const fake = db([setRow("ex-5", 2, 12, 65), setRow("ex-5", 1, 10, 60)]);
    const result = await logSetCore(fake.client, "user-1", {
      sessionExerciseId: "ex-5", setNumber: 2, reps: 8, weightKg: 60, durationSeconds: null,
    });
    const saved = savedSetsOf(result);
    eq(saved.map((s) => s.setNumber).join(","), "1,2", "saved set numbers in order");
    eq(saved[1].reps, 12, "set 2 reps from the fresh tab");
    eq(saved[1].weightKg, 65, "set 2 weight from the fresh tab");
    eq(working(fake, "ex-5", 2)[0].reps, 12, "stored set 2 unchanged");
  });

  await test("race: insert hits 23505 and the winner has other values → conflict, winner kept", async () => {
    const fake = db();
    let raced = false;
    fake.beforeRequest = (req) => {
      if (req.method === "POST" && !raced) {
        raced = true;
        fake.tables.session_sets.push(setRow("ex-6", 1, 12, 65));
      }
    };
    const result = await logSetCore(fake.client, "user-1", {
      sessionExerciseId: "ex-6", setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null,
    });
    const saved = savedSetsOf(result);
    eq(saved[0].reps, 12, "returned winner's reps");
    eq(saved[0].weightKg, 65, "returned winner's weight");
    const rows = working(fake, "ex-6", 1);
    eq(rows.length, 1, "rows for set 1");
    eq(rows[0].reps, 12, "winner's reps kept");
  });

  await test("race: insert hits 23505 and the winner has the same values → ok", async () => {
    const fake = db();
    let raced = false;
    fake.beforeRequest = (req) => {
      if (req.method === "POST" && !raced) {
        raced = true;
        fake.tables.session_sets.push(setRow("ex-7", 1, 10, 60));
      }
    };
    const result = await logSetCore(fake.client, "user-1", {
      sessionExerciseId: "ex-7", setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null,
    });
    eq(result.ok, true, "result.ok");
    eq(working(fake, "ex-7", 1).length, 1, "rows for set 1");
  });

  await test("any other insert error is reported", async () => {
    const fake = db();
    fake.beforeRequest = (req) =>
      req.method === "POST" ? json(500, { code: "XX000", message: "Network error", details: null, hint: null }) : undefined;
    const result = await logSetCore(fake.client, "user-1", {
      sessionExerciseId: "ex-8", setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null,
    });
    assert(!result.ok && "error" in result && result.error === "Network error", `got ${JSON.stringify(result)}`);
  });

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
