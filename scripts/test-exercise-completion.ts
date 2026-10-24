#!/usr/bin/env tsx
/**
 * Tests for exerciseCompletion helper.
 *
 * Verifies the partial-exercise rule: an exercise with 1+ working sets logged
 * is PARTIAL, not skipped. Skipped means 0 working sets only.
 *
 *   npx tsx scripts/test-exercise-completion.ts
 */

import { exerciseCompletion } from "../src/lib/session/completion";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log("Testing exerciseCompletion helper\n");

// Test 1: 0 working sets = skipped
const result1 = exerciseCompletion({ workingSetsLogged: 0, plannedSets: 4 });
assertEquals(result1.kind, "skipped", "0 working sets: kind is skipped");
assertEquals(result1.label, "Skipped", "0 working sets: label is 'Skipped'");
assertEquals(result1.strikethrough, true, "0 working sets: strikethrough is true");

// Test 2: 1 of 4 sets = partial
const result2 = exerciseCompletion({ workingSetsLogged: 1, plannedSets: 4 });
assertEquals(result2.kind, "partial", "1 of 4 sets: kind is partial");
assertEquals(result2.label, "Partly done · 1 of 4 sets", "1 of 4 sets: label shows '1 of 4 sets'");
assertEquals(result2.strikethrough, false, "1 of 4 sets: strikethrough is false");

// Test 3: 3 of 4 sets = partial
const result3 = exerciseCompletion({ workingSetsLogged: 3, plannedSets: 4 });
assertEquals(result3.kind, "partial", "3 of 4 sets: kind is partial");
assertEquals(result3.label, "Partly done · 3 of 4 sets", "3 of 4 sets: label shows '3 of 4 sets'");
assertEquals(result3.strikethrough, false, "3 of 4 sets: strikethrough is false");

// Test 4: 4 of 4 sets = done
const result4 = exerciseCompletion({ workingSetsLogged: 4, plannedSets: 4 });
assertEquals(result4.kind, "done", "4 of 4 sets: kind is done");
assertEquals(result4.label, "", "4 of 4 sets: label is empty string");
assertEquals(result4.strikethrough, false, "4 of 4 sets: strikethrough is false");

// Test 5: More than planned = done
const result5 = exerciseCompletion({ workingSetsLogged: 5, plannedSets: 4 });
assertEquals(result5.kind, "done", "5 of 4 sets: kind is done");
assertEquals(result5.label, "", "5 of 4 sets: label is empty string");
assertEquals(result5.strikethrough, false, "5 of 4 sets: strikethrough is false");

// Test 6: Edge case - 0 planned, 0 logged
const result6 = exerciseCompletion({ workingSetsLogged: 0, plannedSets: 0 });
assertEquals(result6.kind, "skipped", "0 of 0 sets: kind is skipped");
assertEquals(result6.label, "Skipped", "0 of 0 sets: label is 'Skipped'");
assertEquals(result6.strikethrough, true, "0 of 0 sets: strikethrough is true");

// Test 7: Edge case - 1 planned, 1 logged
const result7 = exerciseCompletion({ workingSetsLogged: 1, plannedSets: 1 });
assertEquals(result7.kind, "done", "1 of 1 sets: kind is done");
assertEquals(result7.label, "", "1 of 1 sets: label is empty string");
assertEquals(result7.strikethrough, false, "1 of 1 sets: strikethrough is false");

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All exercise completion tests passed!");
