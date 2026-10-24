/**
 * Unit tests for history edit validation functions.
 * 
 * Tests all validation rules with boundary values and edge cases.
 */

import {
  validateReps,
  validateWeightKg,
  validateSetMetrics,
  validateDateNotFuture,
  validateDateAfterSignup,
  validateTimestampsPresent,
  validateTimestampsParseable,
  validateLocalDateMatchesStartedAt,
  checkTimeRangeOverlap,
} from "../src/lib/history/edit-validation";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("Testing history edit validation");

// Test validateReps
console.log("\n1. validateReps");
{
  check("null is valid", validateReps(null).valid);
  check("0 is invalid", !validateReps(0).valid);
  check("1 is valid", validateReps(1).valid);
  check("100 is valid", validateReps(100).valid);
  check("101 is invalid", !validateReps(101).valid);
  check("negative is invalid", !validateReps(-5).valid);
  check("10.5 is invalid (not integer)", !validateReps(10.5).valid);
  check("50 is valid", validateReps(50).valid);
}

// Test validateWeightKg
console.log("\n2. validateWeightKg");
{
  check("null is valid", validateWeightKg(null).valid);
  check("-0.01 is invalid", !validateWeightKg(-0.01).valid);
  check("0 is valid", validateWeightKg(0).valid);
  check("0.5 is valid", validateWeightKg(0.5).valid);
  check("100.25 is valid (2 decimals)", validateWeightKg(100.25).valid);
  check("100.255 is invalid (3 decimals)", !validateWeightKg(100.255).valid);
  check("500 is valid", validateWeightKg(500).valid);
  check("500.01 is invalid", !validateWeightKg(500.01).valid);
  check("600 is invalid", !validateWeightKg(600).valid);
  check("Infinity is invalid", !validateWeightKg(Infinity).valid);
}

// Test validateSetMetrics
console.log("\n3. validateSetMetrics");
{
  check("null reps and null weight (no duration) is invalid", !validateSetMetrics(null, null, null).valid);
  check("null reps with weight is valid", validateSetMetrics(null, 100, null).valid);
  check("reps with null weight is valid", validateSetMetrics(10, null, null).valid);
  check("both reps and weight is valid", validateSetMetrics(10, 100, null).valid);
  check("duration set with null reps/weight is valid", validateSetMetrics(null, null, 60).valid);
}

// Test validateDateNotFuture (Asia/Kolkata timezone)
console.log("\n4. validateDateNotFuture (Asia/Kolkata)");
{
  // We need to get today's date in the timezone to test properly
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  const tomorrowStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(tomorrow);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1));
  const yesterdayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(yesterday);
  
  check("today is valid", validateDateNotFuture(today, "Asia/Kolkata").valid);
  check("yesterday is valid", validateDateNotFuture(yesterdayStr, "Asia/Kolkata").valid);
  check("tomorrow is invalid", !validateDateNotFuture(tomorrowStr, "Asia/Kolkata").valid);
}

// Test validateDateNotFuture (Pacific/Auckland timezone)
console.log("\n5. validateDateNotFuture (Pacific/Auckland)");
{
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  const tomorrowStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(tomorrow);
  
  check("today is valid", validateDateNotFuture(today, "Pacific/Auckland").valid);
  check("tomorrow is invalid", !validateDateNotFuture(tomorrowStr, "Pacific/Auckland").valid);
}

// Test validateDateAfterSignup
console.log("\n6. validateDateAfterSignup (Asia/Kolkata)");
{
  const signupUtc = "2026-10-14T04:30:00Z"; // 2026-10-14 10:00 IST
  check("same day as signup is valid", validateDateAfterSignup("2026-10-14", signupUtc, "Asia/Kolkata").valid);
  check("day after signup is valid", validateDateAfterSignup("2026-10-15", signupUtc, "Asia/Kolkata").valid);
  check("day before signup is invalid", !validateDateAfterSignup("2026-10-13", signupUtc, "Asia/Kolkata").valid);
  check("one day before signup is invalid", !validateDateAfterSignup("2026-10-13", signupUtc, "Asia/Kolkata").valid);
}

// Test validateDateAfterSignup (Pacific/Auckland timezone)
console.log("\n7. validateDateAfterSignup (Pacific/Auckland)");
{
  const signupUtc = "2026-10-14T04:30:00Z"; // Different local date in Auckland
  const aucklandLocalSignupDate = new Intl.DateTimeFormat("en-CA", { 
    timeZone: "Pacific/Auckland" 
  }).format(new Date(signupUtc));
  
  check("signup date in Auckland is valid", validateDateAfterSignup(aucklandLocalSignupDate, signupUtc, "Pacific/Auckland").valid);
  
  // Calculate day before in Auckland
  const [y, m, d] = aucklandLocalSignupDate.split("-").map(Number);
  const dayBefore = new Date(Date.UTC(y, m - 1, d - 1));
  const dayBeforeStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(dayBefore);
  check("day before signup in Auckland is invalid", !validateDateAfterSignup(dayBeforeStr, signupUtc, "Pacific/Auckland").valid);
}

// Test validateTimestampsPresent
console.log("\n8. validateTimestampsPresent");
{
  check("both present is valid", validateTimestampsPresent("2026-10-24T10:00:00Z", "2026-10-24T11:00:00Z").valid);
  check("null startedAt is invalid", !validateTimestampsPresent(null, "2026-10-24T11:00:00Z").valid);
  check("null completedAt is invalid", !validateTimestampsPresent("2026-10-24T10:00:00Z", null).valid);
  check("empty startedAt is invalid", !validateTimestampsPresent("", "2026-10-24T11:00:00Z").valid);
  check("empty completedAt is invalid", !validateTimestampsPresent("2026-10-24T10:00:00Z", "").valid);
}

// Test validateTimestampsParseable
console.log("\n9. validateTimestampsParseable");
{
  check("valid ISO timestamps are valid", validateTimestampsParseable("2026-10-24T10:00:00Z", "2026-10-24T11:00:00Z").valid);
  check("invalid startedAt is invalid", !validateTimestampsParseable("not-a-time", "2026-10-24T11:00:00Z").valid);
  check("invalid completedAt is invalid", !validateTimestampsParseable("2026-10-24T10:00:00Z", "garbage").valid);
}

// Test validateLocalDateMatchesStartedAt
console.log("\n10. validateLocalDateMatchesStartedAt (Asia/Kolkata)");
{
  // 2026-10-24T10:00:00Z = 2026-10-24 15:30 IST
  check("matching date is valid", validateLocalDateMatchesStartedAt("2026-10-24", "2026-10-24T10:00:00Z", "Asia/Kolkata").valid);
  check("mismatched date is invalid", !validateLocalDateMatchesStartedAt("2026-10-23", "2026-10-24T10:00:00Z", "Asia/Kolkata").valid);
  check("mismatched date (off by 1) is invalid", !validateLocalDateMatchesStartedAt("2026-10-25", "2026-10-24T10:00:00Z", "Asia/Kolkata").valid);
}

// Test validateLocalDateMatchesStartedAt (Pacific/Auckland - across midnight UTC)
console.log("\n11. validateLocalDateMatchesStartedAt (Pacific/Auckland)");
{
  // UTC time that's one day in Auckland
  const utcTime = "2026-10-24T10:00:00Z";
  const aucklandDate = new Intl.DateTimeFormat("en-CA", { 
    timeZone: "Pacific/Auckland" 
  }).format(new Date(utcTime));
  
  check("date matches Auckland local date", validateLocalDateMatchesStartedAt(aucklandDate, utcTime, "Pacific/Auckland").valid);
  
  // Calculate a day off
  const [y, m, d] = aucklandDate.split("-").map(Number);
  const wrongDay = new Date(Date.UTC(y, m - 1, d - 1));
  const wrongDayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(wrongDay);
  check("wrong date is invalid", !validateLocalDateMatchesStartedAt(wrongDayStr, utcTime, "Pacific/Auckland").valid);
}

// Test checkTimeRangeOverlap
console.log("\n12. checkTimeRangeOverlap");
{
  const existing = [
    { started_at: "2026-10-24T10:00:00Z", completed_at: "2026-10-24T11:00:00Z" },
  ];
  
  check("no overlap (before) is valid", checkTimeRangeOverlap(
    new Date("2026-10-24T08:00:00Z"),
    new Date("2026-10-24T09:00:00Z"),
    existing
  ).valid);
  
  check("no overlap (after) is valid", checkTimeRangeOverlap(
    new Date("2026-10-24T12:00:00Z"),
    new Date("2026-10-24T13:00:00Z"),
    existing
  ).valid);
  
  check("exact overlap is invalid", checkTimeRangeOverlap(
    new Date("2026-10-24T10:00:00Z"),
    new Date("2026-10-24T11:00:00Z"),
    existing
  ).valid === false);
  
  check("partial overlap (start inside) is invalid", checkTimeRangeOverlap(
    new Date("2026-10-24T10:30:00Z"),
    new Date("2026-10-24T11:30:00Z"),
    existing
  ).valid === false);
  
  check("partial overlap (end inside) is invalid", checkTimeRangeOverlap(
    new Date("2026-10-24T09:30:00Z"),
    new Date("2026-10-24T10:30:00Z"),
    existing
  ).valid === false);
  
  check("complete overlap (contains existing) is invalid", checkTimeRangeOverlap(
    new Date("2026-10-24T09:00:00Z"),
    new Date("2026-10-24T12:00:00Z"),
    existing
  ).valid === false);
  
  check("adjacent (end = start) is valid", checkTimeRangeOverlap(
    new Date("2026-10-24T09:00:00Z"),
    new Date("2026-10-24T10:00:00Z"),
    existing
  ).valid);
  
  check("adjacent (start = end) is valid", checkTimeRangeOverlap(
    new Date("2026-10-24T11:00:00Z"),
    new Date("2026-10-24T12:00:00Z"),
    existing
  ).valid);
  
  check("no existing sessions is valid", checkTimeRangeOverlap(
    new Date("2026-10-24T10:00:00Z"),
    new Date("2026-10-24T11:00:00Z"),
    []
  ).valid);
}

// Test boundary values with multiple timezones
console.log("\n13. Boundary values (Asia/Kolkata)");
{
  check("reps boundary: 1 is valid", validateReps(1).valid);
  check("reps boundary: 100 is valid", validateReps(100).valid);
  check("weight boundary: 0 is valid", validateWeightKg(0).valid);
  check("weight boundary: 500 is valid", validateWeightKg(500).valid);
}

console.log("\n14. Boundary values (Pacific/Auckland)");
{
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date());
  check("today in Auckland is valid", validateDateNotFuture(today, "Pacific/Auckland").valid);
}

if (failures > 0) {
  console.log(`\n❌ ${failures} FAILURES\n`);
  process.exit(1);
}

console.log("\n✅ All validation tests passed\n");
process.exit(0);
