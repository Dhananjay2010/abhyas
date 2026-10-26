/**
 * Test keepPlannedDay core logic (Fix 1: 'Keep it' on Rest override).
 *
 * Behavioural test using the REAL exported function against a fake DB.
 * 
 *   npx tsx scripts/test-plan-day-keep-core.ts
 */

import { strict as assert } from "node:assert";
import { keepPlannedDay } from "../src/lib/session/plan-day-keep-core";
import { createFakeDb, type Row } from "./helpers/fake-postgrest";

export {}; // Module

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

function sessionRow(id: string, actualType: string | null): Row {
  return {
    id,
    user_id: "user-1",
    local_date: "2026-10-26",
    status: "planned",
    actual_type: actualType,
  };
}

async function main() {
  console.log("Testing keepPlannedDay\n");

  await test("(a) Rest override on template training day: 'keep' → NO delete", async () => {
    const fake = createFakeDb({
      tables: {
        sessions: [sessionRow("rest-override-1", "rest")],
      },
    });

    const planned = [{ id: "rest-override-1", actual_type: "rest" as const }];
    const result = await keepPlannedDay(fake.client, planned);

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 0, "No sessions should be deleted");
    
    // Verify row still exists in fake DB
    const remaining = fake.tables.sessions.filter((s) => s.id === "rest-override-1");
    assert.equal(remaining.length, 1, "Rest override row should still exist");
  });

  await test("(a.2) Multiple Rest overrides: 'keep' → NO delete", async () => {
    const fake = createFakeDb({
      tables: {
        sessions: [
          sessionRow("rest-override-1", "rest"),
          sessionRow("rest-override-2", "rest"),
        ],
      },
    });

    const planned = [
      { id: "rest-override-1", actual_type: "rest" as const },
      { id: "rest-override-2", actual_type: "rest" as const },
    ];
    const result = await keepPlannedDay(fake.client, planned);

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 0, "No sessions should be deleted");
    assert.equal(fake.tables.sessions.length, 2, "Both Rest overrides should remain");
  });

  await test("(b) Non-rest override (Lower on template Rest): 'keep' → deleted", async () => {
    const fake = createFakeDb({
      tables: {
        sessions: [sessionRow("lower-override-1", "weights")],
      },
    });

    const planned = [{ id: "lower-override-1", actual_type: "weights" as const }];
    const result = await keepPlannedDay(fake.client, planned);

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 1, "One session should be deleted");
    assert.equal(result.deletedIds[0], "lower-override-1", "Correct session deleted");
    
    // Verify row was deleted from fake DB
    const remaining = fake.tables.sessions.filter((s) => s.id === "lower-override-1");
    assert.equal(remaining.length, 0, "Override row should be deleted");
  });

  await test("(b.2) Yoga override: 'keep' → deleted", async () => {
    const fake = createFakeDb({
      tables: {
        sessions: [sessionRow("yoga-override-1", "yoga")],
      },
    });

    const planned = [{ id: "yoga-override-1", actual_type: "yoga" as const }];
    const result = await keepPlannedDay(fake.client, planned);

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 1, "Yoga override should be deleted");
    assert.equal(fake.tables.sessions.length, 0, "No rows should remain");
  });

  await test("(c) Mixed planned rows (Rest + Lower): 'keep' → all deleted", async () => {
    // Mixed case: if ANY planned session is non-Rest, all are deleted
    // (This is the current behaviour: allRest check is .every())
    const fake = createFakeDb({
      tables: {
        sessions: [
          sessionRow("rest-1", "rest"),
          sessionRow("lower-1", "weights"),
        ],
      },
    });

    const planned = [
      { id: "rest-1", actual_type: "rest" as const },
      { id: "lower-1", actual_type: "weights" as const },
    ];
    const result = await keepPlannedDay(fake.client, planned);

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 2, "Both sessions should be deleted");
    assert.equal(fake.tables.sessions.length, 0, "All mixed overrides deleted");
  });

  await test("No planned sessions: 'keep' → no delete, success", async () => {
    const fake = createFakeDb({ tables: { sessions: [] } });
    const result = await keepPlannedDay(fake.client, []);

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 0, "No deletes");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
