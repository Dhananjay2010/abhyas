#!/usr/bin/env tsx
/**
 * Unit tests for chart value formatting with thousands separators.
 * 
 * Tests formatValueExact and formatValueRounded from src/lib/progress/format-chart-value.ts
 * to ensure headlines/readouts show exact values with separators and axis ticks are rounded.
 */

import { formatValueExact, formatValueRounded } from "../src/lib/progress/format-chart-value";

let exitCode = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error((err as Error).message);
      exitCode = 1;
    }
  })();
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

(async () => {
  // formatValueExact tests (used for headlines and readouts)
  await test("formatValueExact: 11850 kg", () => {
    assertEqual(formatValueExact(11850, "kg"), "11,850 kg");
  });

  await test("formatValueExact: 12000 kg", () => {
    assertEqual(formatValueExact(12000, "kg"), "12,000 kg");
  });

  await test("formatValueExact: 5782.4 kg preserves decimal", () => {
    assertEqual(formatValueExact(5782.4, "kg"), "5,782.4 kg");
  });

  await test("formatValueExact: 99.94 preserves decimal", () => {
    assertEqual(formatValueExact(99.94, ""), "99.94");
  });

  await test("formatValueExact: 0 with unit", () => {
    assertEqual(formatValueExact(0, "kg"), "0 kg");
  });

  await test("formatValueExact: negative value", () => {
    assertEqual(formatValueExact(-150.5, "kg"), "-150.5 kg");
  });

  await test("formatValueExact: empty unit", () => {
    assertEqual(formatValueExact(11850, ""), "11,850");
  });

  // formatValueRounded tests (used for axis ticks)
  await test("formatValueRounded: rounds large values to integer", () => {
    assertEqual(formatValueRounded(11850.7, "kg"), "11,851 kg");
  });

  await test("formatValueRounded: 12000 stays exact", () => {
    assertEqual(formatValueRounded(12000, "kg"), "12,000 kg");
  });

  await test("formatValueRounded: small values keep 1 decimal", () => {
    assertEqual(formatValueRounded(99.94, ""), "99.9");
  });

  await test("formatValueRounded: axis tick formatting (no unit)", () => {
    assertEqual(formatValueRounded(5782, ""), "5,782");
  });

  console.log("\nChart value formatting tests complete");
  process.exit(exitCode);
})();
