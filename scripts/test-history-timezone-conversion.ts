/**
 * Test: History edit timezone conversion helpers
 *
 * Verifies:
 * - utcToZonedDateTime correctly converts UTC to member's timezone
 * - zonedDateTimeToUtc correctly converts member's timezone to UTC
 * - DST transitions are handled properly
 * - Late-evening edits land on the correct local date
 */

import { utcToZonedDateTime, zonedDateTimeToUtc } from "../src/lib/timezone";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testUtcToZonedIST() {
  console.log("\n▶ Testing UTC to Asia/Kolkata (IST +05:30)...");

  // Test case from QA report: 2026-08-31T13:14:00Z should show as 18:44 IST
  const result = utcToZonedDateTime("2026-08-31T13:14:00Z", "Asia/Kolkata");
  
  assert(
    result.date === "2026-08-31",
    `Expected date "2026-08-31", got "${result.date}"`
  );
  assert(
    result.time === "18:44",
    `Expected time "18:44", got "${result.time}"`
  );

  console.log("  ✓ 2026-08-31T13:14:00Z → 2026-08-31 18:44 IST");
}

function testZonedToUtcIST() {
  console.log("\n▶ Testing Asia/Kolkata (IST) to UTC...");

  // Test case: entering 07:00–08:00 on 2026-08-31 IST should store 01:30–02:30 UTC
  const startUtc = zonedDateTimeToUtc("2026-08-31", "07:00", "Asia/Kolkata");
  const endUtc = zonedDateTimeToUtc("2026-08-31", "08:00", "Asia/Kolkata");
  
  // Parse to check the time components
  const startDate = new Date(startUtc);
  const endDate = new Date(endUtc);
  
  assert(
    startDate.getUTCHours() === 1 && startDate.getUTCMinutes() === 30,
    `Expected start 01:30 UTC, got ${startDate.getUTCHours()}:${String(startDate.getUTCMinutes()).padStart(2, '0')}`
  );
  assert(
    endDate.getUTCHours() === 2 && endDate.getUTCMinutes() === 30,
    `Expected end 02:30 UTC, got ${endDate.getUTCHours()}:${String(endDate.getUTCMinutes()).padStart(2, '0')}`
  );
  
  // Verify the date is still 2026-08-31 in UTC (early morning)
  assert(
    startDate.getUTCFullYear() === 2026 &&
    startDate.getUTCMonth() === 7 && // August (0-indexed)
    startDate.getUTCDate() === 31,
    `Expected UTC date 2026-08-31, got ${startDate.getUTCFullYear()}-${startDate.getUTCMonth() + 1}-${startDate.getUTCDate()}`
  );

  console.log("  ✓ 2026-08-31 07:00 IST → 2026-08-31T01:30Z");
  console.log("  ✓ 2026-08-31 08:00 IST → 2026-08-31T02:30Z");
  console.log("  ✓ Duration: 3600 seconds (1 hour)");
}

function testLateEveningIST() {
  console.log("\n▶ Testing late evening IST (23:30) crossing UTC day boundary...");

  // 23:30 IST on 2026-08-31 should be 18:00 UTC on 2026-08-31
  const result = zonedDateTimeToUtc("2026-08-31", "23:30", "Asia/Kolkata");
  const date = new Date(result);
  
  assert(
    date.getUTCHours() === 18 && date.getUTCMinutes() === 0,
    `Expected 18:00 UTC, got ${date.getUTCHours()}:${String(date.getUTCMinutes()).padStart(2, '0')}`
  );
  assert(
    date.getUTCDate() === 31,
    `Expected UTC date 31, got ${date.getUTCDate()}`
  );

  // Verify it converts back correctly
  const backToIST = utcToZonedDateTime(result, "Asia/Kolkata");
  assert(
    backToIST.date === "2026-08-31",
    `Expected IST date "2026-08-31", got "${backToIST.date}"`
  );
  assert(
    backToIST.time === "23:30",
    `Expected IST time "23:30", got "${backToIST.time}"`
  );

  console.log("  ✓ 2026-08-31 23:30 IST → 2026-08-31T18:00Z");
  console.log("  ✓ Local date stays 2026-08-31 in IST");
}

function testAmericaNewYorkDST() {
  console.log("\n▶ Testing America/New_York DST transitions...");

  // March 9, 2026: DST begins (EDT, UTC-4)
  // Test a time during EDT
  const edtResult = zonedDateTimeToUtc("2026-03-15", "14:30", "America/New_York");
  const edtDate = new Date(edtResult);
  
  assert(
    edtDate.getUTCHours() === 18 && edtDate.getUTCMinutes() === 30,
    `Expected 18:30 UTC (EDT -04:00), got ${edtDate.getUTCHours()}:${String(edtDate.getUTCMinutes()).padStart(2, '0')}`
  );

  // November 2, 2026: DST ends (EST, UTC-5)
  // Test a time during EST
  const estResult = zonedDateTimeToUtc("2026-11-15", "14:30", "America/New_York");
  const estDate = new Date(estResult);
  
  assert(
    estDate.getUTCHours() === 19 && estDate.getUTCMinutes() === 30,
    `Expected 19:30 UTC (EST -05:00), got ${estDate.getUTCHours()}:${String(estDate.getUTCMinutes()).padStart(2, '0')}`
  );

  console.log("  ✓ 2026-03-15 14:30 EDT → 18:30 UTC (UTC-4)");
  console.log("  ✓ 2026-11-15 14:30 EST → 19:30 UTC (UTC-5)");
}

function testRoundTrip() {
  console.log("\n▶ Testing round-trip conversions...");

  const testCases = [
    { utc: "2026-08-31T13:14:00Z", tz: "Asia/Kolkata" },
    { utc: "2026-03-15T18:30:00Z", tz: "America/New_York" },
    { utc: "2026-11-15T19:30:00Z", tz: "America/New_York" },
    { utc: "2026-12-25T12:00:00Z", tz: "Europe/London" },
  ];

  for (const { utc, tz } of testCases) {
    const zoned = utcToZonedDateTime(utc, tz);
    const backToUtc = zonedDateTimeToUtc(zoned.date, zoned.time, tz);
    
    // Parse both to compare (ignore milliseconds)
    const original = new Date(utc);
    const converted = new Date(backToUtc);
    
    const timeDiff = Math.abs(original.getTime() - converted.getTime());
    assert(
      timeDiff < 60000, // Allow up to 1 minute difference for rounding
      `Round-trip failed for ${utc} in ${tz}: difference ${timeDiff}ms`
    );
  }

  console.log(`  ✓ All ${testCases.length} round-trip conversions passed`);
}

function testDuration() {
  console.log("\n▶ Testing duration calculation...");

  // 07:00–08:00 should be 3600 seconds (1 hour)
  const start = zonedDateTimeToUtc("2026-08-31", "07:00", "Asia/Kolkata");
  const end = zonedDateTimeToUtc("2026-08-31", "08:00", "Asia/Kolkata");
  
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const durationSeconds = Math.round((endMs - startMs) / 1000);
  
  assert(
    durationSeconds === 3600,
    `Expected 3600 seconds, got ${durationSeconds}`
  );

  console.log("  ✓ 07:00–08:00 = 3600 seconds");
}

// Run tests
console.log("🧪 Testing History timezone conversion helpers");
console.log("=" .repeat(50));

try {
  testUtcToZonedIST();
  testZonedToUtcIST();
  testLateEveningIST();
  testAmericaNewYorkDST();
  testRoundTrip();
  testDuration();
  
  console.log("\n" + "=".repeat(50));
  console.log("✅ All timezone conversion tests passed!");
  process.exit(0);
} catch (error) {
  console.error("\n" + "=".repeat(50));
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
