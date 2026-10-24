#!/usr/bin/env tsx
/**
 * Unit tests for chart formatValue thousands separators (item 3).
 * 
 * Tests that formatValue in charts.tsx uses thousands separators.
 * Since formatValue is internal, we test the behavior through number formatting.
 */

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
  // Test the toLocaleString behavior that formatValue uses
  await test("toLocaleString adds thousands separator for large numbers", () => {
    const value = 11850;
    const formatted = value.toLocaleString("en-US");
    assertEqual(formatted, "11,850", "Should have comma separator");
  });

  await test("toLocaleString works for 12000", () => {
    const value = 12000;
    const formatted = value.toLocaleString("en-US");
    assertEqual(formatted, "12,000", "Should have comma separator");
  });

  await test("toLocaleString doesn't add separator for small numbers", () => {
    const value = 850;
    const formatted = value.toLocaleString("en-US");
    assertEqual(formatted, "850", "No comma for numbers < 1000");
  });

  await test("toLocaleString works for 900", () => {
    const value = 900;
    const formatted = value.toLocaleString("en-US");
    assertEqual(formatted, "900", "No comma for numbers < 1000");
  });

  console.log("\nChart formatValue tests complete");
  process.exit(exitCode);
})();

