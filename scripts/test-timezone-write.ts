/**
 * Test: shouldWriteTimezone decision logic
 *
 * Verifies the timezone write logic:
 * - Write when explicitly changed (regardless of current value)
 * - Write when current is NULL (first-time browser detection)
 * - Don't overwrite existing value with browser detection
 */

import { shouldWriteTimezone } from "../src/lib/timezone-write";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testExplicitlyChanged() {
  console.log("\n▶ Testing explicitly changed timezone...");

  // Should write when explicitly changed, regardless of current value
  assert(
    shouldWriteTimezone(null, "America/New_York", true),
    "Should write when explicitly changed and current is NULL"
  );

  assert(
    shouldWriteTimezone("Asia/Kolkata", "America/New_York", true),
    "Should write when explicitly changed and current is Asia/Kolkata"
  );

  assert(
    shouldWriteTimezone("Europe/London", "America/New_York", true),
    "Should write when explicitly changed and current is different"
  );

  console.log("  ✓ Always writes when explicitly changed");
}

function testBrowserDetection() {
  console.log("\n▶ Testing browser-detected timezone...");

  // Should write when current is NULL (not set yet)
  assert(
    shouldWriteTimezone(null, "America/New_York", false),
    "Should write browser timezone when current is NULL"
  );

  assert(
    shouldWriteTimezone(undefined, "America/New_York", false),
    "Should write browser timezone when current is undefined"
  );

  // Should NOT overwrite existing value with browser detection
  assert(
    !shouldWriteTimezone("Asia/Kolkata", "America/New_York", false),
    "Should NOT overwrite Asia/Kolkata with browser timezone"
  );

  assert(
    !shouldWriteTimezone("Europe/London", "America/New_York", false),
    "Should NOT overwrite existing timezone with browser timezone"
  );

  console.log("  ✓ Only writes browser timezone when current is NULL");
}

function testEdgeCases() {
  console.log("\n▶ Testing edge cases...");

  // Null incoming with explicit change (e.g., user selected "Use gym default")
  assert(
    shouldWriteTimezone("America/New_York", null, true),
    "Should write NULL when explicitly changed to gym default"
  );

  // Empty string treated as falsy
  assert(
    shouldWriteTimezone("", "America/New_York", false),
    "Empty string current should be treated as not set"
  );

  console.log("  ✓ Edge cases handled correctly");
}

function main() {
  console.log("Testing shouldWriteTimezone logic...");

  try {
    testExplicitlyChanged();
    testBrowserDetection();
    testEdgeCases();
    console.log("\n✅ All timezone write tests passed!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Timezone write tests failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
