#!/usr/bin/env tsx
/*
 * Test: updateSessionCore (restarting a skipped or unstarted session).
 *
 * Runs against a real supabase-js client backed by the in-memory PostgREST
 * stand-in, with the partial unique index from migration 20261025000022. When
 * flipping a session to in_progress collides with one already in progress,
 * the action must hand back that session rather than fail.
 */

import { updateSessionCore } from "../src/lib/session/update-session-core";
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

const skipped: Row = { id: "session-123", user_id: "user-1", local_date: "2026-10-24", status: "skipped", created_at: "2026-10-24T04:00:00.000Z" };

function db(rows: Row[]): FakeDb {
  return createFakeDb({
    tables: { sessions: rows },
    unique: [{ table: "sessions", columns: ["user_id"], where: (r) => r.status === "in_progress" }],
  });
}

const restart = (fake: FakeDb) =>
  updateSessionCore(fake.client, "session-123", "user-1", "2026-10-24", { status: "in_progress" });

const statusOf = (fake: FakeDb, id: string) => fake.tables.sessions.find((r) => r.id === id)?.status;

async function main() {
  console.log("Testing updateSessionCore\n");

  await test("update succeeds → the same session id, now in progress", async () => {
    const fake = db([{ ...skipped }]);
    const result = await restart(fake);
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    eq(result.sessionId, "session-123", "returned session id");
    eq(statusOf(fake, "session-123"), "in_progress", "status after update");
  });

  await test("23505 → the session already in progress today is returned and nothing else changes", async () => {
    const fake = db([
      { ...skipped },
      { id: "existing-456", user_id: "user-1", local_date: "2026-10-24", status: "in_progress", created_at: "2026-10-24T05:00:00.000Z" },
    ]);
    const result = await restart(fake);
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    eq(result.sessionId, "existing-456", "returned session id");
    eq(statusOf(fake, "session-123"), "skipped", "the skipped session is untouched");
  });

  await test("23505 but the re-read finds nothing → an error", async () => {
    const fake = db([{ ...skipped }]);
    fake.beforeRequest = (req) =>
      req.method === "PATCH"
        ? json(409, { code: "23505", message: "duplicate key value violates unique constraint", details: null, hint: null })
        : undefined;
    const result = await restart(fake);
    if (result.ok) throw new Error("expected an error");
    eq(result.error, "Could not start the session", "error message");
  });

  await test("any other update error is reported", async () => {
    const fake = db([{ ...skipped }]);
    fake.beforeRequest = (req) =>
      req.method === "PATCH" ? json(500, { code: "XX000", message: "Connection timeout", details: null, hint: null }) : undefined;
    const result = await restart(fake);
    if (result.ok) throw new Error("expected an error");
    eq(result.error, "Connection timeout", "error message");
  });

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
