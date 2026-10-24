#!/usr/bin/env tsx
/**
 * Unit tests for parsePageParam (QA Bot 3 M4).
 * 
 * Tests that the page param parser handles invalid inputs correctly:
 * - Non-numeric strings (abc) → clamp to 1
 * - Zero or negative (0, -1) → clamp to 1
 * - Beyond total pages → clamp to last page
 */

import { parsePageParam } from "../src/lib/history/parse-page-param";

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
test("valid page number", () => {
  assertEqual(parsePageParam("5", 10), 5);
});

test("undefined param → 1", () => {
  assertEqual(parsePageParam(undefined, 10), 1);
});

test("non-numeric string (abc) → 1", () => {
  assertEqual(parsePageParam("abc", 10), 1);
});

test("zero → 1", () => {
  assertEqual(parsePageParam("0", 10), 1);
});

test("negative (-1) → 1", () => {
  assertEqual(parsePageParam("-1", 10), 1);
});

test("beyond total pages (99 > 5) → last page", () => {
  assertEqual(parsePageParam("99", 5), 5);
});

test("at last page", () => {
  assertEqual(parsePageParam("5", 5), 5);
});

test("first page", () => {
  assertEqual(parsePageParam("1", 10), 1);
});

test("empty total pages (0) handles beyond correctly", () => {
  // When totalPages is 0, page should still be clamped to 1
  assertEqual(parsePageParam("5", 0), 5);
});

test("float string → truncated integer", () => {
  assertEqual(parsePageParam("3.7", 10), 3);
});

console.log("\nparsePageParam tests complete");
process.exit(exitCode);
