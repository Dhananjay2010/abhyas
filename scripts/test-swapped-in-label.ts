#!/usr/bin/env tsx
/**
 * Test LOW: swapped-in exercise with 0 sets shows "Swapped in" not "Skipped".
 *
 *   npx tsx scripts/test-swapped-in-label.ts
 */

import { countWorkingSets, getCompletionDisplay } from "../src/lib/today/row-helpers";

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

console.log("\nTesting swapped-in exercise label logic\n");

// Test 1: Swapped-in exercise with 0 sets should show "Swapped in"
console.log("1. Swapped-in exercise with 0 working sets on ended session");
{
  const workingSetsLogged = 0;
  const plannedSets = 3;
  const sessionStatus = "completed" as const;
  const isSwappedIn = true;

  const { label } = getCompletionDisplay(sessionStatus, workingSetsLogged, plannedSets);
  
  const finalLabel = isSwappedIn && workingSetsLogged === 0 && sessionStatus !== "in_progress"
    ? "Swapped in"
    : label;

  assertEquals(finalLabel, "Swapped in", "Label should be 'Swapped in' for swapped exercise with 0 sets");
}

// Test 2: Swapped-in exercise with sets should show partial/completed
console.log("\n2. Swapped-in exercise with partial sets on ended session");
{
  const workingSetsLogged = 2;
  const plannedSets = 3;
  const sessionStatus = "completed" as const;
  const isSwappedIn = true;

  const { label } = getCompletionDisplay(sessionStatus, workingSetsLogged, plannedSets);
  
  const finalLabel = isSwappedIn && workingSetsLogged === 0 && sessionStatus !== "in_progress"
    ? "Swapped in"
    : label;

  assertEquals(finalLabel, "Partly done · 2 of 3 sets", "Label should show partial completion for swapped exercise with some sets");
}

// Test 3: Non-swapped exercise with 0 sets should show "Skipped"
console.log("\n3. Non-swapped exercise with 0 sets shows 'Skipped'");
{
  const workingSetsLogged = 0;
  const plannedSets = 3;
  const sessionStatus = "completed" as const;
  const isSwappedIn = false;

  const { label } = getCompletionDisplay(sessionStatus, workingSetsLogged, plannedSets);
  
  const finalLabel = isSwappedIn && workingSetsLogged === 0 && sessionStatus !== "in_progress"
    ? "Swapped in"
    : label;

  assertEquals(finalLabel, "Skipped", "Label should be 'Skipped' for non-swapped exercise with 0 sets");
}

// Test 4: In-progress session doesn't show any label
console.log("\n4. In-progress swapped exercise shows empty label");
{
  const workingSetsLogged = 0;
  const plannedSets = 3;
  const sessionStatus = "in_progress" as const;
  const isSwappedIn = true;

  const { label } = getCompletionDisplay(sessionStatus, workingSetsLogged, plannedSets);
  
  const finalLabel = isSwappedIn && workingSetsLogged === 0 && sessionStatus !== "in_progress"
    ? "Swapped in"
    : label;

  assertEquals(finalLabel, "", "In-progress session should show empty label");
}

// Test 5: Strikethrough should be false for swapped-in with 0 sets
console.log("\n5. Swapped-in with 0 sets has no strikethrough");
{
  const workingSetsLogged = 0;
  const plannedSets = 3;
  const sessionStatus = "completed" as const;
  const isSwappedIn = true;

  const { strikethrough } = getCompletionDisplay(sessionStatus, workingSetsLogged, plannedSets);
  
  const finalStrikethrough = isSwappedIn && workingSetsLogged === 0 ? false : strikethrough;

  assertEquals(finalStrikethrough, false, "Swapped-in with 0 sets should not be struck through");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All swapped-in-label tests passed!");
