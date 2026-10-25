#!/usr/bin/env tsx
/*
 * Test: startSessionCore and the one-in-progress-session-per-user index.
 *
 * Runs against a real supabase-js client backed by the in-memory PostgREST
 * stand-in, with the partial unique index from migration 20261025000022
 * (sessions(user_id) where status = 'in_progress'). A second start must come
 * back with the session that already exists, not an error and not a duplicate.
 */

import { startSessionCore } from "../src/lib/session/start-session-core";
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

function eq<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function db(rows: Row[] = []): FakeDb {
  return createFakeDb({
    tables: { sessions: rows },
    unique: [{ table: "sessions", columns: ["user_id"], where: (r) => r.status === "in_progress" }],
  });
}

const start = (fake: FakeDb) =>
  startSessionCore(fake.client, "user-1", {
    user_id: "user-1",
    program_day_id: "day-1",
    local_date: "2026-10-24",
    status: "in_progress",
    started_at: "2026-10-24T06:00:00.000Z",
  });

const inProgress = (fake: FakeDb) =>
  fake.tables.sessions.filter((r) => r.user_id === "user-1" && r.status === "in_progress");

async function main() {
  console.log("Testing startSessionCore\n");

  await test("no session in progress → a new one is created", async () => {
    const fake = db();
    const result = await start(fake);
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    const rows = inProgress(fake);
    eq(rows.length, 1, "in-progress sessions");
    eq(result.sessionId, rows[0].id, "returned id is the new row");
  });

  await test("23505 from the unique index → the existing in-progress session is returned", async () => {
    const fake = db([
      { id: "existing-456", user_id: "user-1", local_date: "2026-10-24", status: "in_progress", created_at: "2026-10-24T05:00:00.000Z" },
      { id: "other-user", user_id: "user-2", local_date: "2026-10-24", status: "in_progress", created_at: "2026-10-24T05:30:00.000Z" },
    ]);
    const result = await start(fake);
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    eq(result.sessionId, "existing-456", "returned session id");
    eq(inProgress(fake).length, 1, "in-progress sessions for the user");
  });

  await test("23505 but the re-read finds nothing → a clear error is returned", async () => {
    const fake = db();
    fake.beforeRequest = (req) =>
      req.method === "POST"
        ? json(409, { code: "23505", message: "duplicate key value violates unique constraint", details: null, hint: null })
        : undefined;
    const result = await start(fake);
    if (result.ok) throw new Error("expected an error");
    eq(result.error, "Another session is already in progress. Please reload the page and try again.", `error message`);
  });

  await test("any other insert error is reported", async () => {
    const fake = db();
    fake.beforeRequest = (req) =>
      req.method === "POST" ? json(500, { code: "XX000", message: "Network error", details: null, hint: null }) : undefined;
    const result = await start(fake);
    if (result.ok) throw new Error("expected an error");
    eq(result.error, "Network error", "error message");
  });

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
