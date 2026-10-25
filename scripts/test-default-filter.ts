#!/usr/bin/env tsx
/**
 * Unit tests for getDefaultFilter (QA M-4).
 * 
 * Tests that the default History filter is determined correctly
 * from the member's primary track.
 */

import { getDefaultFilter } from "../src/lib/history/default-filter";

let exitCode = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error((err as Error).message);
    exitCode = 1;
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// Test cases
test("yoga track → yoga filter", () => {
  assertEqual(getDefaultFilter("yoga"), "yoga");
});

test("meditation track → breathing filter", () => {
  assertEqual(getDefaultFilter("meditation"), "breathing");
});

test("weights track → lifts filter", () => {
  assertEqual(getDefaultFilter("weights"), "lifts");
});

test("bodyweight track → lifts filter", () => {
  assertEqual(getDefaultFilter("bodyweight"), "lifts");
});

test("null track → lifts filter", () => {
  assertEqual(getDefaultFilter(null), "lifts");
});

console.log("\ngetDefaultFilter tests complete");
process.exit(exitCode);
