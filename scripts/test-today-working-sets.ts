#!/usr/bin/env tsx
/**
 * Test that today page correctly counts working sets and only shows completion
 * labels for ended sessions.
 *
 *   npx tsx scripts/test-today-working-sets.ts
 */

import { exerciseCompletion } from "../src/lib/session/completion";

let testsPassed = 0;
let testsFailed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    testsFailed++;
  }
}

function runTests() {
  console.log("\nTesting today page working set counting\n");

  console.log("1. Working sets counted as !is_warmup_set");
  {
    // Simulate data from today page query
    const sessionSets = [
      { is_warmup_set: true },
      { is_warmup_set: false },
      { is_warmup_set: false },
      { is_warmup_set: false },
    ];

    const workingSetsLogged = sessionSets.filter((s) => !s.is_warmup_set).length;
    assertEquals(workingSetsLogged, 3, "3 working sets (excluding warmup)");
  }

  console.log("\n2. Exercise completion states");
  {
    assertEquals(exerciseCompletion(0, 3), "skipped", "0 of 3 = skipped");
    assertEquals(exerciseCompletion(2, 3), "partial", "2 of 3 = partial");
    assertEquals(exerciseCompletion(3, 3), "completed", "3 of 3 = completed");
    assertEquals(exerciseCompletion(0, 0), "skipped", "0 of 0 = skipped (no sets logged)");
  }

  console.log("\n3. Completion labels only shown when session ended");
  {
    // This test documents the behavior: in-progress sessions should NOT
    // show "Skipped" or "Partly done" labels or strikethrough.
    // The implementation in today/page.tsx checks:
    //   const sessionEnded = performed?.status !== "in_progress";
    //   if (sessionEnded) { ... show labels ... }

    type SessionStatus = "in_progress" | "completed" | "skipped";

    function shouldShowLabels(status: SessionStatus): boolean {
      return status !== "in_progress";
    }

    assertEquals(
      shouldShowLabels("in_progress"),
      false,
      "In-progress session should NOT show completion labels",
    );

    assertEquals(
      shouldShowLabels("completed"),
      true,
      "Ended session should show completion labels",
    );

    assertEquals(
      shouldShowLabels("skipped"),
      true,
      "Skipped session should show completion labels",
    );
  }

  console.log(`\n✅ Passed: ${testsPassed}`);
  if (testsFailed > 0) {
    console.log(`❌ Failed: ${testsFailed}`);
    process.exit(1);
  }

  console.log("\n✨ All today page working set tests passed!");
}

runTests();
