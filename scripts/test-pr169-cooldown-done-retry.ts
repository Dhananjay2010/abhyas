#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up LOW-3: cool-down Done shows "Try again" when finish fails.
 * 
 * Verifies that shouldShowFinishRetry returns true for both Done and Skip failures,
 * ensuring consistent retry affordance across both cool-down finish paths.
 * 
 *   npx tsx scripts/test-pr169-cooldown-done-retry.ts
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

(function main() {
  console.log("\nPR #169 follow-up LOW-3: cool-down Done shows Try again on failure\n");

  console.log("Case 1: Finish succeeds");
  {
    const result = shouldShowFinishRetry(true);
    assertEquals(result, false, "no retry button when finish succeeds");
  }

  console.log("\nCase 2: Finish fails");
  {
    const result = shouldShowFinishRetry(false);
    assertEquals(result, true, "show Try again when finish fails");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All cool-down Done retry tests passed!");
})();
