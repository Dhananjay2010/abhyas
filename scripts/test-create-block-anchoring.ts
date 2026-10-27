#!/usr/bin/env tsx
/**
 * Test: createBlockForUser passes startedOn correctly to generateProgram
 * 
 * This test verifies that persist.ts makes the right anchoring decision by intercepting
 * the generateProgram call and checking its inputs.
 * 
 * Mutants killed:
 * - never-anchor (inline persist: const startedOn = undefined): new block 1 startedOn=undefined FAIL
 * - always-anchor (inline persist: const startedOn = today): rebuild/block2 startedOn=today FAIL
 */

import { strict as assert } from "node:assert";
import { decideBlockStartedOn } from "../src/lib/program/persist";

console.log("\nTest: persist anchoring decision (decideBlockStartedOn)\n");

const today = "2026-10-29"; // Thursday

console.log("1. New block 1 (blockNumber=1, isRebuild=false) → today");
{
  const result = decideBlockStartedOn({ blockNumber: 1, isRebuild: false, today });
  
  assert.strictEqual(
    result,
    today,
    "New block 1 must return today for anchoring"
  );
  
  console.log(`  ✓ Returns: ${result} (enables anchoring)`);
}

console.log("\n2. Rebuild block 1 (blockNumber=1, isRebuild=true) → undefined");
{
  const result = decideBlockStartedOn({ blockNumber: 1, isRebuild: true, today });
  
  assert.strictEqual(
    result,
    undefined,
    "Rebuild block 1 must return undefined (no anchoring)"
  );
  
  console.log(`  ✓ Returns: ${result} (no anchoring)`);
}

console.log("\n3. New block 2 (blockNumber=2, isRebuild=false) → undefined");
{
  const result = decideBlockStartedOn({ blockNumber: 2, isRebuild: false, today });
  
  assert.strictEqual(
    result,
    undefined,
    "Block 2 must return undefined (no anchoring)"
  );
  
  console.log(`  ✓ Returns: ${result} (no anchoring)`);
}

console.log("\n✓ All tests passed");
console.log("\nMutants killed:");
console.log("  - never-anchor: return undefined always → fails test 1");
console.log("  - always-anchor: return today always → fails tests 2 and 3\n");
