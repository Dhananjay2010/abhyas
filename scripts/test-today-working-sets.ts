#!/usr/bin/env tsx
/**
 * Test that today page correctly counts working sets and only shows completion
 * labels for ended sessions.
 *
 *   npx tsx scripts/test-today-working-sets.ts
 */

import { exerciseCompletion } from "../src/lib/session/completion";
import { countWorkingSets, shouldShowCompletionLabels, getCompletionDisplay } from "../src/lib/today/row-helpers";

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

  console.log("1. countWorkingSets: excludes warmup sets");
  {
    const sessionSets = [
      { is_warmup_set: true },
      { is_warmup_set: false },
      { is_warmup_set: false },
      { is_warmup_set: false },
    ];

    const workingSetsLogged = countWorkingSets(sessionSets);
    assertEquals(workingSetsLogged, 3, "3 working sets (excluding warmup)");
  }

  console.log("\n2. Exercise completion states");
  {
    assertEquals(exerciseCompletion(0, 3), "skipped", "0 of 3 = skipped");
    assertEquals(exerciseCompletion(2, 3), "partial", "2 of 3 = partial");
    assertEquals(exerciseCompletion(3, 3), "completed", "3 of 3 = completed");
    assertEquals(exerciseCompletion(0, 0), "skipped", "0 of 0 = skipped (no sets logged)");
  }

  console.log("\n3. shouldShowCompletionLabels: only for ended sessions");
  {
    assertEquals(
      shouldShowCompletionLabels("in_progress"),
      false,
      "In-progress session should NOT show completion labels",
    );

    assertEquals(
      shouldShowCompletionLabels("completed"),
      true,
      "Ended session should show completion labels",
    );

    assertEquals(
      shouldShowCompletionLabels("skipped"),
      true,
      "Skipped session should show completion labels",
    );
  }

  console.log("\n4. getCompletionDisplay: combines status and completion logic");
  {
    // In-progress: no label regardless of completion
    const inProgress = getCompletionDisplay("in_progress", 0, 3);
    assertEquals(inProgress.label, "", "In-progress: empty label");
    assertEquals(inProgress.strikethrough, false, "In-progress: no strikethrough");

    // Ended, skipped exercise
    const skipped = getCompletionDisplay("completed", 0, 3);
    assertEquals(skipped.label, "Skipped", "Ended, 0 sets: 'Skipped'");
    assertEquals(skipped.strikethrough, true, "Ended, 0 sets: strikethrough");

    // Ended, partial completion
    const partial = getCompletionDisplay("completed", 2, 3);
    assertEquals(partial.label, "Partly done · 2 of 3 sets", "Ended, 2 of 3: 'Partly done'");
    assertEquals(partial.strikethrough, false, "Ended, partial: no strikethrough");

    // Ended, completed
    const completed = getCompletionDisplay("completed", 3, 3);
    assertEquals(completed.label, "", "Ended, completed: empty label");
    assertEquals(completed.strikethrough, false, "Ended, completed: no strikethrough");
  }

  console.log(`\n✅ Passed: ${testsPassed}`);
  if (testsFailed > 0) {
    console.log(`❌ Failed: ${testsFailed}`);
    process.exit(1);
  }

  console.log("\n✨ All today page working set tests passed!");
}

runTests();
