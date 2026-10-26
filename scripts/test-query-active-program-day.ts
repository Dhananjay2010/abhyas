/**
 * Test queryActiveProgramDay query filters.
 *
 *   npx tsx scripts/test-query-active-program-day.ts
 */

import { strict as assert } from "node:assert";
import { createFakeDb } from "./helpers/fake-postgrest";
import { queryActiveProgramDay } from "../src/lib/session/query-active-program-day";

export {}; // Module

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

async function main() {
  console.log("Testing queryActiveProgramDay\n");

  await test("Returns active program day for user, program, and day_index", async () => {
    const db = createFakeDb();
    db.tables.program_days = [
      { id: "day-1", user_id: "user-1", program_id: "prog-1", status: "active", day_index: 7, day_type: "weights" },
      { id: "day-2", user_id: "user-1", program_id: "prog-1", status: "active", day_index: 1, day_type: "rest" },
      { id: "day-old", user_id: "user-1", program_id: "prog-old", status: "active", day_index: 7, day_type: "bodyweight" },
      { id: "day-inactive", user_id: "user-1", program_id: "prog-1", status: "inactive", day_index: 7, day_type: "yoga" },
      { id: "day-other-user", user_id: "user-2", program_id: "prog-1", status: "active", day_index: 7, day_type: "meditation" },
    ];

    const result = await queryActiveProgramDay(db.client, "user-1", "prog-1", 7);

    assert.equal(result.error, null, "Should not error");
    assert(result.day, "Should return a day");
    assert.equal(result.day.id, "day-1", "Should return the correct day");
    assert.equal(result.day.day_type, "weights", "Should return the correct day_type");
  });

  await test("Returns null when no matching day exists", async () => {
    const db = createFakeDb();
    db.tables.program_days = [
      { id: "day-1", user_id: "user-1", program_id: "prog-1", status: "active", day_index: 1, day_type: "weights" },
    ];

    const result = await queryActiveProgramDay(db.client, "user-1", "prog-1", 7);

    assert.equal(result.error, null, "Should not error");
    assert.equal(result.day, null, "Should return null when no match");
  });

  await test("Filters by user_id (rejects other user)", async () => {
    const db = createFakeDb();
    db.tables.program_days = [
      { id: "day-1", user_id: "user-2", program_id: "prog-1", status: "active", day_index: 7, day_type: "weights" },
    ];

    const result = await queryActiveProgramDay(db.client, "user-1", "prog-1", 7);

    assert.equal(result.error, null, "Should not error");
    assert.equal(result.day, null, "Should not return other user's day");
  });

  await test("Filters by program_id (rejects old program)", async () => {
    const db = createFakeDb();
    db.tables.program_days = [
      { id: "day-old", user_id: "user-1", program_id: "prog-old", status: "active", day_index: 7, day_type: "weights" },
    ];

    const result = await queryActiveProgramDay(db.client, "user-1", "prog-1", 7);

    assert.equal(result.error, null, "Should not error");
    assert.equal(result.day, null, "Should not return old program's day");
  });

  await test("Filters by status='active' (rejects inactive)", async () => {
    const db = createFakeDb();
    db.tables.program_days = [
      { id: "day-inactive", user_id: "user-1", program_id: "prog-1", status: "inactive", day_index: 7, day_type: "weights" },
    ];

    const result = await queryActiveProgramDay(db.client, "user-1", "prog-1", 7);

    assert.equal(result.error, null, "Should not error");
    assert.equal(result.day, null, "Should not return inactive day");
  });

  await test("Filters by day_index (rejects other weekday)", async () => {
    const db = createFakeDb();
    db.tables.program_days = [
      { id: "day-1", user_id: "user-1", program_id: "prog-1", status: "active", day_index: 1, day_type: "weights" },
    ];

    const result = await queryActiveProgramDay(db.client, "user-1", "prog-1", 7);

    assert.equal(result.error, null, "Should not error");
    assert.equal(result.day, null, "Should not return other weekday");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
