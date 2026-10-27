#!/usr/bin/env tsx
/**
 * Mutant (b): persist always passes startedOn: today
 * 
 * This test verifies that removing the block-number check from
 * decideBlockStartedOn causes failures.
 */

import { strict as assert } from "node:assert";

/**
 * MUTANT VERSION: Always returns today regardless of block number.
 * This incorrectly anchors ALL blocks, including rollover blocks (2+).
 */
function decideBlockStartedOnMutant({
  today,
}: {
  blockNumber: number;
  today: string;
}): string | undefined {
  // MUTANT: Block number check removed - always anchor
  return today;
}

const today = "2026-10-15";
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Block 1: should still work");
{
  const result = decideBlockStartedOnMutant({ blockNumber: 1, today });
  check("returns today", result === today, `got ${result}, expected ${today}`);
}

console.log("\n2. Block 2 (rollover): MUTANT SHOULD FAIL");
{
  const result = decideBlockStartedOnMutant({ blockNumber: 2, today });
  check("should return undefined, mutant returns today", result === undefined, `got ${result}, expected undefined`);
}

console.log("\n3. Block 3 (rollover): MUTANT SHOULD FAIL");
{
  const result = decideBlockStartedOnMutant({ blockNumber: 3, today });
  check("should return undefined, mutant returns today", result === undefined, `got ${result}, expected undefined`);
}

console.log("\n4. Block 10 (rollover): MUTANT SHOULD FAIL");
{
  const result = decideBlockStartedOnMutant({ blockNumber: 10, today });
  check("should return undefined, mutant returns today", result === undefined, `got ${result}, expected undefined`);
}

console.log(`\n${failures === 0 ? "MUTANT SURVIVED (BAD)" : `MUTANT KILLED: ${failures} test(s) failed as expected`}\n`);
process.exit(failures === 0 ? 1 : 0);

export {};
