#!/usr/bin/env tsx
/**
 * Smoke test: Today page helper functions are correctly typed and imported.
 * 
 * This test verifies that the helper functions (countWorkingSets, getCompletionDisplay,
 * sessionSummaryTitle) exist, are correctly typed, and produce expected output.
 * It does NOT test that the Today page actually uses these functions - that would
 * require rendering the page component.
 */

// Smoke test: verify imports and basic functionality

import { countWorkingSets, getCompletionDisplay } from "../src/lib/today/row-helpers";
import { sessionSummaryTitle } from "../src/lib/session/end-early-text";

let passed = 0;
let failed = 0;

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

console.log("\nTesting Today page ended-early display wiring\n");

// Test countWorkingSets
{
  const count = countWorkingSets([
    { is_warmup_set: true, reps: 5, duration_seconds: null },
    { is_warmup_set: false, reps: 10, duration_seconds: null },
    { is_warmup_set: false, reps: 10, duration_seconds: null },
  ]);
  assertTrue(count === 2, "countWorkingSets counts non-warmup sets with logged data");
}

// Test getCompletionDisplay
{
  const display = getCompletionDisplay("completed", 2, 3, false);
  assertTrue(
    display.label === "Partly done · 2 of 3 sets",
    "getCompletionDisplay shows partial completion"
  );
  assertTrue(!display.strikethrough, "Partial completion not struck through");
}

{
  const display = getCompletionDisplay("completed", 0, 3, false);
  assertTrue(display.label === "Skipped", "getCompletionDisplay shows skipped");
  assertTrue(display.strikethrough, "Skipped is struck through");
}

// Test sessionSummaryTitle
{
  const title = sessionSummaryTitle(true);
  assertTrue(
    title === "Session ended early",
    "sessionSummaryTitle returns 'Session ended early' for endedEarly=true"
  );
}

{
  const title = sessionSummaryTitle(false);
  assertTrue(
    title === "Session complete",
    "sessionSummaryTitle returns 'Session complete' for endedEarly=false"
  );
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ Today ended-early display wiring test passed!");
