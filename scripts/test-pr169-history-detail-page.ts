#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up item 4 & 6 (detail page): History detail page behavioral test.
 * 
 * Tests that the history detail page:
 * - Filters warm-ups from volume calculation
 * - Uses formatDurationMinutes for time display ('<1 min' for <60s, 'X min' for >=60s)
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
  console.log("\nPR #169 follow-up item 4 & 6: History detail page behavioral test\n");

  console.log("Item 4: Volume calculation filters warm-ups (PRODUCTION CODE)");
  {
    const session = {
      duration_seconds: 600,
      status: "completed",
      actual_type: "weights",
    };
    
    // Mix of warm-up and working sets
    const sets = [
      { reps: 5, weight_kg: 20, is_warmup_set: true },  // warm-up: 100 kg
      { reps: 10, weight_kg: 50, is_warmup_set: false }, // working: 500 kg
      { reps: 8, weight_kg: 60, is_warmup_set: false },  // working: 480 kg
      { reps: 3, weight_kg: 30, is_warmup_set: true },   // warm-up: 90 kg
    ];
    
    const view = buildHistoryDetailView(session, sets);
    assertEquals(view.volumeKg, 980, "production code: volume excludes warm-ups (500 + 480 = 980 kg)");
  }

  console.log("\nItem 4: Mutant test - volume WITHOUT filter includes warm-ups");
  {
    const session = {
      duration_seconds: 600,
      status: "completed",
      actual_type: "weights",
    };
    
    const sets = [
      { reps: 5, weight_kg: 20, is_warmup_set: true },  // warm-up: 100 kg
      { reps: 10, weight_kg: 50, is_warmup_set: false }, // working: 500 kg
    ];
    
    const view = buildHistoryDetailView(session, sets);
    assertEquals(view.volumeKg, 500, "production code excludes warm-ups (500 only, not 600)");
  }

  console.log("\nItem 6: Duration format for <1 minute (PRODUCTION CODE)");
  {
    const session30s = { duration_seconds: 30, status: "completed", actual_type: "weights" };
    const view30 = buildHistoryDetailView(session30s, []);
    assertEquals(view30.durationText, "<1 min", "production: 30 seconds shows '<1 min'");
    
    const session59s = { duration_seconds: 59, status: "completed", actual_type: "weights" };
    const view59 = buildHistoryDetailView(session59s, []);
    assertEquals(view59.durationText, "<1 min", "production: 59 seconds shows '<1 min'");
    
    const session0s = { duration_seconds: 0, status: "completed", actual_type: "weights" };
    const view0 = buildHistoryDetailView(session0s, []);
    assertEquals(view0.durationText, null, "production: 0 seconds returns null");
    
    const sessionNull = { duration_seconds: null, status: "completed", actual_type: "weights" };
    const viewNull = buildHistoryDetailView(sessionNull, []);
    assertEquals(viewNull.durationText, "—", "production: null shows '—'");
  }

  console.log("\nItem 6: Duration format for >=1 minute (PRODUCTION CODE)");
  {
    const session60s = { duration_seconds: 60, status: "completed", actual_type: "weights" };
    const view60 = buildHistoryDetailView(session60s, []);
    assertEquals(view60.durationText, "1 min", "production: 60 seconds shows '1 min'");
    
    const session120s = { duration_seconds: 120, status: "completed", actual_type: "weights" };
    const view120 = buildHistoryDetailView(session120s, []);
    assertEquals(view120.durationText, "2 min", "production: 120 seconds shows '2 min'");
    
    const session90s = { duration_seconds: 90, status: "completed", actual_type: "weights" };
    const view90 = buildHistoryDetailView(session90s, []);
    assertEquals(view90.durationText, "2 min", "production: 90 seconds rounds to '2 min'");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All history detail page tests passed!");
})();
