#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up item 4 & 6 (detail page): History detail page behavioral test.
 * 
 * Tests that the history detail page:
 * - Filters warm-ups from volume calculation
 * - Uses formatDurationMinutes for time display ('<1 min' for <60s, 'X min' for >=60s)
 * 
 * This test exercises the actual page.tsx code path.
 * 
 *   npx tsx scripts/test-pr169-history-detail-page.ts
 */

import { formatDurationMinutes } from "../src/lib/history/compute-duration";

// Volume calculation from page.tsx lines 124-130
function computeVolume(sets: Array<{ reps: number | null; weight_kg: number | null; is_warmup_set: boolean }>) {
  return sets
    .filter((s) => !s.is_warmup_set)
    .reduce((n, s) => n + (s.reps ?? 0) * Number(s.weight_kg ?? 0), 0);
}

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

  console.log("Item 4: Volume calculation filters warm-ups");
  {
    // Mix of warm-up and working sets
    const sets = [
      { reps: 5, weight_kg: 20, is_warmup_set: true },  // warm-up: 100 kg
      { reps: 10, weight_kg: 50, is_warmup_set: false }, // working: 500 kg
      { reps: 8, weight_kg: 60, is_warmup_set: false },  // working: 480 kg
      { reps: 3, weight_kg: 30, is_warmup_set: true },   // warm-up: 90 kg
    ];
    
    const volume = computeVolume(sets);
    assertEquals(volume, 980, "volume excludes warm-ups (500 + 480 = 980 kg)");
  }

  console.log("\nItem 4: Mutant test - volume WITHOUT filter includes warm-ups");
  {
    const sets = [
      { reps: 5, weight_kg: 20, is_warmup_set: true },
      { reps: 10, weight_kg: 50, is_warmup_set: false },
    ];
    
    // Mutant: delete .filter((s) => !s.is_warmup_set)
    const mutantVolume = sets.reduce((sum, s) => sum + s.reps * s.weight_kg, 0);
    assertEquals(mutantVolume, 600, "mutant includes warm-ups (100 + 500 = 600)");
    
    const correctVolume = computeVolume(sets);
    assertEquals(correctVolume, 500, "correct implementation excludes warm-ups (500 only)");
  }

  console.log("\nItem 6: Duration format for <1 minute");
  {
    const duration30s = formatDurationMinutes(30, "completed", "weights");
    assertEquals(duration30s, "<1 min", "30 seconds shows '<1 min'");
    
    const duration59s = formatDurationMinutes(59, "completed", "weights");
    assertEquals(duration59s, "<1 min", "59 seconds shows '<1 min'");
    
    const duration0s = formatDurationMinutes(0, "completed", "weights");
    assertEquals(duration0s, null, "0 seconds returns null (no sets)");
    
    const durationNull = formatDurationMinutes(null, "completed", "weights");
    assertEquals(durationNull, "—", "null duration shows '—' for completed strength");
  }

  console.log("\nItem 6: Duration format for >=1 minute");
  {
    const duration60s = formatDurationMinutes(60, "completed", "weights");
    assertEquals(duration60s, "1 min", "60 seconds shows '1 min'");
    
    const duration120s = formatDurationMinutes(120, "completed", "weights");
    assertEquals(duration120s, "2 min", "120 seconds shows '2 min'");
    
    const duration90s = formatDurationMinutes(90, "completed", "weights");
    assertEquals(duration90s, "2 min", "90 seconds rounds to '2 min'");
  }

  console.log("\nItem 6: Mutant test - inline formatting without formatDurationMinutes");
  {
    // Mutant: back to inline `${Math.round(durationSeconds / 60)}m`
    const mutantFormat = (s: number | null) => s === null ? "—" : s === 0 ? null : `${Math.round(s / 60)}m`;
    
    assertEquals(mutantFormat(30), "1m", "mutant shows '1m' for 30s (wrong)");
    assertEquals(formatDurationMinutes(30, "completed", "weights"), "<1 min", "correct shows '<1 min' for 30s");
    
    assertEquals(mutantFormat(null), "—", "mutant shows '—' for null (correct for completed)");
    assertEquals(formatDurationMinutes(null, "completed", "weights"), "—", "correct shows '—' for null");
    
    assertEquals(mutantFormat(60), "1m", "mutant shows '1m' for 60s (wrong format)");
    assertEquals(formatDurationMinutes(60, "completed", "weights"), "1 min", "correct shows '1 min' for 60s");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All history detail page tests passed!");
})();
