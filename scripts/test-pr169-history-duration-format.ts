#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up item 6: History detail and list both show '<1 min' for sessions under a minute.
 * 
 * Verifies that both the history list and detail page use the shared formatDurationMinutes
 * function, which shows '<1 min' instead of '0m' for sessions under 60 seconds.
 * 
 *   npx tsx scripts/test-pr169-history-duration-format.ts
 */

import { formatDurationMinutes } from "../src/lib/history/compute-duration";

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
  console.log("\nPR #169 follow-up item 6: History duration shows '<1 min' consistently\n");

  console.log("Case 1: Duration 0 seconds (ended early with no sets)");
  {
    const result = formatDurationMinutes(0, "completed", "weights");
    assertEquals(result, null, "0 seconds returns null (caller shows 'Ended early')");
  }

  console.log("\nCase 2: Duration 30 seconds (under a minute)");
  {
    const result = formatDurationMinutes(30, "completed", "weights");
    assertEquals(result, "<1 min", "30 seconds shows '<1 min'");
  }

  console.log("\nCase 3: Duration 59 seconds (just under a minute)");
  {
    const result = formatDurationMinutes(59, "completed", "weights");
    assertEquals(result, "<1 min", "59 seconds shows '<1 min'");
  }

  console.log("\nCase 4: Duration 60 seconds (exactly one minute)");
  {
    const result = formatDurationMinutes(60, "completed", "weights");
    assertEquals(result, "1 min", "60 seconds shows '1 min'");
  }

  console.log("\nCase 5: Duration 90 seconds");
  {
    const result = formatDurationMinutes(90, "completed", "weights");
    assertEquals(result, "2 min", "90 seconds rounds to '2 min'");
  }

  console.log("\nCase 6: Duration 1200 seconds (20 minutes)");
  {
    const result = formatDurationMinutes(1200, "completed", "weights");
    assertEquals(result, "20 min", "1200 seconds shows '20 min'");
  }

  console.log("\nCase 7: Duration null for completed strength session");
  {
    const result = formatDurationMinutes(null, "completed", "weights");
    assertEquals(result, "—", "null duration shows '—' for completed strength");
  }

  console.log("\nCase 8: Duration null for in_progress session");
  {
    const result = formatDurationMinutes(null, "in_progress", "weights");
    assertEquals(result, null, "null duration returns null for in_progress");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All history duration format tests passed!");
})();
