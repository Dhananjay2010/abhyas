#!/usr/bin/env tsx
/**
 * Test the hasTimezone type guard used in finish-session-deps.
 *
 *   npx tsx scripts/test-has-timezone-guard.ts
 */

(function runTests() {
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

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}: expected true, got false`);
    failed++;
  }
}

function assertFalse(condition: boolean, message: string) {
  if (!condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}: expected false, got true`);
    failed++;
  }
}

// Extract the type guard for testing
function hasTimezone(profiles: unknown): profiles is { timezone: string | null } {
  return (
    profiles !== null &&
    typeof profiles === 'object' &&
    'timezone' in profiles &&
    (typeof (profiles as { timezone: unknown }).timezone === 'string' ||
     (profiles as { timezone: unknown }).timezone === null)
  );
}

console.log("\nTesting hasTimezone type guard\n");

console.log("1. Valid timezone values");
{
  assertTrue(hasTimezone({ timezone: "UTC" }), "String timezone is valid");
  assertTrue(hasTimezone({ timezone: "America/New_York" }), "Different string timezone is valid");
  assertTrue(hasTimezone({ timezone: null }), "null timezone is valid");
  assertTrue(hasTimezone({ timezone: "UTC", other: "field" }), "Extra fields are ok");
}

console.log("\n2. Invalid values");
{
  assertFalse(hasTimezone(null), "null is invalid");
  assertFalse(hasTimezone(undefined), "undefined is invalid");
  assertFalse(hasTimezone({}), "Empty object is invalid");
  assertFalse(hasTimezone({ other: "field" }), "Object without timezone is invalid");
  assertFalse(hasTimezone({ timezone: 123 }), "Number timezone is invalid");
  assertFalse(hasTimezone({ timezone: true }), "Boolean timezone is invalid");
  assertFalse(hasTimezone({ timezone: undefined }), "undefined timezone is invalid");
  assertFalse(hasTimezone("UTC"), "String is invalid");
  assertFalse(hasTimezone(42), "Number is invalid");
}

console.log("\n3. Type narrowing works correctly");
{
  const testData: unknown = { timezone: "Asia/Kolkata" };
  if (hasTimezone(testData)) {
    // TypeScript should narrow the type here
    const tz: string | null = testData.timezone;
    assertEquals(tz, "Asia/Kolkata", "Can access timezone after type guard");
  } else {
    failed++;
    console.error(`❌ Type guard should have returned true`);
  }
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All hasTimezone guard tests passed!");
})();
