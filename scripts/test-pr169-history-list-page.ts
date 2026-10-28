#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up item 6 (list page): History list page duration format.
 * 
 * Tests that the history list page shows '<1 min' for sessions under 1 minute.
 * 
 * This test imports REAL production code (buildHistoryListRow).
 * 
 *   npx tsx scripts/test-pr169-history-list-page.ts
 */

import { buildHistoryListRow } from "../src/lib/history/build-list-row";

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
  console.log("\nPR #169 follow-up item 6: History list page duration format\n");

  console.log("Item 6 (list): Duration format for <1 minute (PRODUCTION CODE)");
  {
    const row30 = buildHistoryListRow(30, "completed", "weights");
    assertEquals(row30.durationText, "<1 min", "production: list shows '<1 min' for 30s");
    
    const row45 = buildHistoryListRow(45, "completed", "weights");
    assertEquals(row45.durationText, "<1 min", "production: list shows '<1 min' for 45s");
    
    const row1 = buildHistoryListRow(1, "completed", "weights");
    assertEquals(row1.durationText, "<1 min", "production: list shows '<1 min' for 1s");
  }

  console.log("\nItem 6 (list): Duration format for >=1 minute (PRODUCTION CODE)");
  {
    const row60 = buildHistoryListRow(60, "completed", "weights");
    assertEquals(row60.durationText, "1 min", "production: list shows '1 min' for 60s");
    
    const row120 = buildHistoryListRow(120, "completed", "weights");
    assertEquals(row120.durationText, "2 min", "production: list shows '2 min' for 120s");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All history list page tests passed!");
})();
