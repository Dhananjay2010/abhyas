#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up items 4 & 6 (detail page): History detail page volume and duration.
 * 
 * Tests that the history detail page:
 * - Excludes warm-up sets from volume calculation (item 4)
 * - Shows '<1 min' for sessions under 1 minute (item 6)
 * 
 * This test imports REAL production code (buildHistoryDetailView).
 * 
 *   npx tsx scripts/test-pr169-history-detail-page.ts
 */

import { buildHistoryDetailView } from "../src/lib/history/build-detail-view";

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
  console.log("\nPR #169 follow-up items 4 & 6: History detail page tests\n");

  console.log("Item 4: Volume excludes warm-ups (PRODUCTION CODE)");
  {
    // Mix of warm-up and working sets
    const sets = [
      { reps: 5, weight_kg: 20, is_warmup_set: true },  // warm-up: 100 kg
      { reps: 10, weight_kg: 50, is_warmup_set: false }, // working: 500 kg
      { reps: 8, weight_kg: 60, is_warmup_set: false },  // working: 480 kg
      { reps: 3, weight_kg: 30, is_warmup_set: true },   // warm-up: 90 kg
    ];
    
    const view = buildHistoryDetailView(600, "completed", "weights", sets);
    assertEquals(view.volumeKg, 980, "production code: volume excludes warm-ups (500 + 480 = 980 kg)");
  }

  console.log("\nItem 4: Mutant test - volume WITHOUT filter includes warm-ups");
  {
    const sets = [
      { reps: 5, weight_kg: 20, is_warmup_set: true },  // warm-up: 100 kg
      { reps: 10, weight_kg: 50, is_warmup_set: false }, // working: 500 kg
    ];
    
    const view = buildHistoryDetailView(600, "completed", "weights", sets);
    assertEquals(view.volumeKg, 500, "production code excludes warm-ups (500 only, not 600)");
  }

  console.log("\nItem 6: Duration format for <1 minute (PRODUCTION CODE)");
  {
    const view30 = buildHistoryDetailView(30, "completed", "weights", []);
    assertEquals(view30.durationText, "<1 min", "production: 30 seconds shows '<1 min'");
    
    const view59 = buildHistoryDetailView(59, "completed", "weights", []);
    assertEquals(view59.durationText, "<1 min", "production: 59 seconds shows '<1 min'");
    
    const view0 = buildHistoryDetailView(0, "completed", "weights", []);
    assertEquals(view0.durationText, null, "production: 0 seconds returns null");
    
    const viewNull = buildHistoryDetailView(null, "completed", "weights", []);
    assertEquals(viewNull.durationText, "—", "production: null shows '—'");
  }

  console.log("\nItem 6: Duration format for >=1 minute (PRODUCTION CODE)");
  {
    const view60 = buildHistoryDetailView(60, "completed", "weights", []);
    assertEquals(view60.durationText, "1 min", "production: 60 seconds shows '1 min'");
    
    const view120 = buildHistoryDetailView(120, "completed", "weights", []);
    assertEquals(view120.durationText, "2 min", "production: 120 seconds shows '2 min'");
    
    const view90 = buildHistoryDetailView(90, "completed", "weights", []);
    assertEquals(view90.durationText, "2 min", "production: 90 seconds rounds to '2 min'");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All history detail page tests passed!");
})();
