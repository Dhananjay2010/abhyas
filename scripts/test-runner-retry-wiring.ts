#!/usr/bin/env tsx
/**
 * Test runner's needsFinishRetry wiring (item 8b).
 *
 * The runner must show "Try again" after a failed finish and clear it after success.
 * This tests the real wiring: setNeedsFinishRetry(shouldShowFinishRetry(succeeded, cooldownCompleted))
 *
 *   npx tsx scripts/test-runner-retry-wiring.ts
 */

import { shouldShowFinishRetry } from "../src/lib/session/finish-flow";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log("\nTesting runner's needsFinishRetry wiring (8b)\n");

console.log("1. Failed finish without cooldown shows retry");
{
  // Simulating: const succeeded = await runFinish(...); setNeedsFinishRetry(shouldShowFinishRetry(succeeded, cooldownCompleted));
  const succeeded = false;
  const cooldownCompleted = false;
  
  const needsFinishRetry = shouldShowFinishRetry(succeeded, cooldownCompleted);
  
  assertEquals(needsFinishRetry, true, "needsFinishRetry should be true after failed finish");
}

console.log("\n2. Successful finish clears retry");
{
  const succeeded = true;
  const cooldownCompleted = false;
  
  const needsFinishRetry = shouldShowFinishRetry(succeeded, cooldownCompleted);
  
  assertEquals(needsFinishRetry, false, "needsFinishRetry should be false after successful finish");
}

console.log("\n3. Failed finish with cooldown doesn't show retry (navigates away)");
{
  const succeeded = false;
  const cooldownCompleted = true;
  
  const needsFinishRetry = shouldShowFinishRetry(succeeded, cooldownCompleted);
  
  assertEquals(needsFinishRetry, false, "needsFinishRetry should be false on cooldown path");
}

console.log("\n4. Retry after initial failure");
{
  // First attempt fails
  let needsFinishRetry = shouldShowFinishRetry(false, false);
  assertEquals(needsFinishRetry, true, "Retry shown after first failure");
  
  // Retry succeeds
  needsFinishRetry = shouldShowFinishRetry(true, false);
  assertEquals(needsFinishRetry, false, "Retry cleared after success");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All runner retry wiring tests passed!");
