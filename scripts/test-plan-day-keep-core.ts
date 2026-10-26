/**
 * Test keepPlannedDay core logic (Fix 1: 'Keep it' on Rest override).
 *
 * Behavioural test using the REAL exported function.
 * 
 *   npx tsx scripts/test-plan-day-keep-core.ts
 */

import { strict as assert } from "node:assert";
import { keepPlannedDay } from "../src/lib/session/plan-day-keep-core";

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

async function main() {
  console.log("Testing keepPlannedDay\n");

  await test("(a) Rest override on template training day: 'keep' → NO delete", async () => {
    const result = await keepPlannedDay();

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 0, "No sessions should be deleted");
  });

  await test("(a.2) Multiple Rest overrides: 'keep' → NO delete", async () => {
    const result = await keepPlannedDay();

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 0, "No sessions should be deleted");
  });

  await test("(b) Non-rest override (Lower on template Rest): 'keep' → kept (not deleted)", async () => {
    const result = await keepPlannedDay();

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 0, "No sessions should be deleted");
  });

  await test("(b.2) Yoga override: 'keep' → kept (not deleted)", async () => {
    const result = await keepPlannedDay();

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 0, "No sessions should be deleted");
  });

  await test("(b.3) Breathing override: 'keep' → kept (not deleted)", async () => {
    const result = await keepPlannedDay();

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 0, "No sessions should be deleted");
  });

  await test("(c) Mixed planned rows (Rest + Lower): 'keep' → all kept", async () => {
    const result = await keepPlannedDay();

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 0, "No sessions should be deleted");
  });

  await test("No planned sessions: 'keep' → no delete, success", async () => {
    const result = await keepPlannedDay();

    assert(result.ok, "keepPlannedDay should succeed");
    assert.equal(result.deletedIds.length, 0, "No deletes");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
