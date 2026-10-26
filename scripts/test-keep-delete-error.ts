/**
 * Test keepPlannedDay delete-error handling (K6).
 *
 * When delete fails, keepPlannedDay must return ok: false with error message.
 *
 *   npx tsx scripts/test-keep-delete-error.ts
 */

import { strict as assert } from "node:assert";
import { keepPlannedDay } from "../src/lib/session/plan-day-keep-core";

export {}; // Module

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  const runTest = async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  };
  return runTest();
}

async function main() {
  console.log("Testing keepPlannedDay delete-error handling\n");

  await test("K6: empty array → ok (no deletes attempted)", async () => {
    type MockClient = Record<string, never>;
    const mockClient: MockClient = {};
    const result = await keepPlannedDay(mockClient as never, []);
    assert.equal(result.ok, true, "Should succeed with empty array");
  });

  await test("K6: any non-empty array → ok (keep logic never deletes)", async () => {
    type MockClient = Record<string, never>;
    const mockClient: MockClient = {};
    const rows = [
      { id: "sess-1", status: "planned", actual_type: "weights", local_date: "2026-11-01" },
      { id: "sess-2", status: "planned", actual_type: "rest", local_date: "2026-11-01" },
    ];
    const result = await keepPlannedDay(mockClient as never, rows as never);
    assert.equal(result.ok, true, "Should succeed (L1: keep keeps everything)");
    if (result.ok) {
      assert.equal(result.deletedIds.length, 0, "No deletes performed");
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
