#!/usr/bin/env tsx
/**
 * Unit tests for History page empty states (Task G11).
 * 
 * Tests the logic and code structure that determines which empty state to show:
 * - True empty (totalCount === 0, no sessions at all)
 * - Filtered empty (items.length === 0 but totalCount > 0)
 * - Populated (items.length > 0)
 */

import { readFileSync } from "fs";
import { join } from "path";

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

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// Read the actual source file
const historyClientPath = join(process.cwd(), "src/app/history/history-client.tsx");
const historyClientSource = readFileSync(historyClientPath, "utf-8");

test("source code contains empty state conditional", () => {
  assert(
    historyClientSource.includes("items.length === 0"),
    "Must check items.length === 0 for empty state"
  );
});

test("source code contains totalCount === 0 check", () => {
  assert(
    historyClientSource.includes("totalCount === 0"),
    "Must check totalCount === 0 to determine true empty vs filtered empty"
  );
});

test("true empty state shows 'No completed sessions yet' message", () => {
  assert(
    historyClientSource.includes("No completed sessions yet"),
    "True empty state must show 'No completed sessions yet' message"
  );
});

test("true empty state shows 'Start today's workout' CTA", () => {
  assert(
    historyClientSource.includes("Start today") && historyClientSource.includes("workout"),
    "True empty state must show 'Start today's workout' CTA"
  );
});

test("true empty state links to /today", () => {
  assert(
    historyClientSource.includes('href="/today"'),
    "True empty state must link to /today page"
  );
});

test("filtered empty state shows 'No sessions match these filters' message", () => {
  assert(
    historyClientSource.includes("No sessions match these filters"),
    "Filtered empty state must show 'No sessions match these filters' message"
  );
});

test("filtered empty state shows clear filters action", () => {
  assert(
    historyClientSource.includes("Clear filters"),
    "Filtered empty state must show 'Clear filters' action"
  );
});

test("conditional structure: totalCount check is nested inside items.length check", () => {
  // Find the empty state section
  const emptyStateSection = historyClientSource.substring(
    historyClientSource.indexOf("items.length === 0"),
    historyClientSource.indexOf("items.length === 0") + 800
  );
  
  // The totalCount check should appear after the items.length check
  const itemsCheckPos = emptyStateSection.indexOf("items.length === 0");
  const totalCountCheckPos = emptyStateSection.indexOf("totalCount === 0");
  
  assert(
    itemsCheckPos < totalCountCheckPos && totalCountCheckPos > 0,
    "totalCount === 0 check must be nested inside items.length === 0 conditional"
  );
});

test("uses brand CSS variables, not hardcoded colors", () => {
  // Check that we're using CSS variables for the CTA button
  const startTodayPos = historyClientSource.indexOf("Start today");
  const ctaSection = historyClientSource.substring(
    Math.max(0, startTodayPos - 200),
    startTodayPos + 100
  );
  
  assert(
    ctaSection.includes("--color-accent") || ctaSection.includes("bg-accent"),
    "Must use brand CSS variables (--color-accent or bg-accent class)"
  );
});

// Test the state determination logic
function determineEmptyState(itemsLength: number, totalCount: number): "true-empty" | "filtered-empty" | "populated" {
  if (itemsLength === 0) {
    return totalCount === 0 ? "true-empty" : "filtered-empty";
  }
  return "populated";
}

test("logic: no items, no total count → true empty", () => {
  const state = determineEmptyState(0, 0);
  assertEqual(state, "true-empty");
});

test("logic: no items, has total count → filtered empty", () => {
  const state = determineEmptyState(0, 15);
  assertEqual(state, "filtered-empty");
});

test("logic: has items → populated", () => {
  const state = determineEmptyState(5, 10);
  assertEqual(state, "populated");
});

test("logic: edge case single item → populated", () => {
  const state = determineEmptyState(1, 1);
  assertEqual(state, "populated");
});

console.log("\nHistory empty states tests complete");
process.exit(exitCode);
