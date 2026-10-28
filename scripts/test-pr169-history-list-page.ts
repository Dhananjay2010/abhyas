#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up item 6 (list page): History list page duration format.
 * 
 * Tests that the history list page shows '<1 min' for sessions under 1 minute.
 * 
 * This test exercises the actual history-client.tsx code path.
 * 
 *   npx tsx scripts/test-pr169-history-list-page.ts
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
  console.log("\nPR #169 follow-up item 6: History list page duration format\n");

  console.log("Item 6 (list): Duration format for <1 minute");
  {
    const duration30s = formatDurationMinutes(30, "completed", "weights");
    assertEquals(duration30s, "<1 min", "list shows '<1 min' for 30s session");
    
    const duration45s = formatDurationMinutes(45, "completed", "weights");
    assertEquals(duration45s, "<1 min", "list shows '<1 min' for 45s session");
    
    const duration1s = formatDurationMinutes(1, "completed", "weights");
    assertEquals(duration1s, "<1 min", "list shows '<1 min' for 1s session");
  }

  console.log("\nItem 6 (list): Mutant test - inline minutes formatting");
  {
    // Mutant: history-client.tsx uses inline `${Math.round(s/60)} min` instead of formatDurationMinutes
    const mutantFormat = (s: number | null) => s === null || s === 0 ? "—" : `${Math.round(s / 60)} min`;
    
    assertEquals(mutantFormat(30), "1 min", "mutant shows '1 min' for 30s (WRONG - should be '<1 min')");
    assertEquals(formatDurationMinutes(30, "completed", "weights"), "<1 min", "correct shows '<1 min' for 30s");
    
    assertEquals(mutantFormat(45), "1 min", "mutant shows '1 min' for 45s (WRONG)");
    assertEquals(formatDurationMinutes(45, "completed", "weights"), "<1 min", "correct shows '<1 min' for 45s");
  }

  console.log("\nItem 6 (list): Duration format for >=1 minute");
  {
    const duration60s = formatDurationMinutes(60, "completed", "weights");
    assertEquals(duration60s, "1 min", "list shows '1 min' for 60s");
    
    const duration120s = formatDurationMinutes(120, "completed", "weights");
    assertEquals(duration120s, "2 min", "list shows '2 min' for 120s");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All history list page tests passed!");
})();
