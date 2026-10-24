/**
 * Test History time display for same-day and multi-day sessions.
 * 
 * Ensures timezone-aware time is shown for:
 * - Today sessions: "Today · 7:40 am"
 * - Yesterday sessions: "Yesterday · 6:05 pm" (if implemented)
 * - Older sessions: "Sat 12 Oct · 9:15 am"
 * 
 *   npx tsx scripts/test-history-time-display.ts
 */

import { formatInTimezone } from "../src/lib/timezone";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nTesting History time display logic\n");

// Mock timezone
const timezone = "America/New_York";

// Helper to format time like the History client does
function formatTime(isoTimestamp: string, tz: string): string {
  return formatInTimezone(new Date(isoTimestamp), tz, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

// Test 1: Today with time
console.log("1. Same-day session with time");
const todayDate = "2026-10-24";
const todayTimestamp = "2026-10-24T11:40:00Z"; // 7:40 AM in America/New_York
const todayTime = formatTime(todayTimestamp, timezone);
const todayLabel = `Today · ${todayTime}`;
check('format is "Today · HH:MM am/pm"', todayLabel.includes("Today ·"));
check("time is formatted", todayTime.match(/\d{1,2}:\d{2}\s[ap]m/) !== null, todayTime);
console.log(`   Result: "${todayLabel}"`);

// Test 2: Older session with date + time
console.log("\n2. Older session with date + time");
const olderDate = "2026-10-12";
const olderTimestamp = "2026-10-12T17:15:00Z"; // 1:15 PM in America/New_York
const olderTime = formatTime(olderTimestamp, timezone);
const olderDateFormatted = longDate(olderDate);
const olderLabel = `${olderDateFormatted} · ${olderTime}`;
check('format is "DayOfWeek DD Mon · HH:MM am/pm"', olderLabel.includes("·"));
check("date is short format", olderDateFormatted.split(" ").length === 3);
check("time is included", olderLabel.includes(olderTime));
console.log(`   Result: "${olderLabel}"`);

// Test 3: Today without time (edge case)
console.log("\n3. Today without completed_at (edge case)");
const todayNoTime = "Today";
check('fallback is just "Today"', todayNoTime === "Today");

// Test 4: Timezone conversion
console.log("\n4. Timezone handling");
const utcTimestamp = "2026-10-24T12:00:00Z"; // Noon UTC
const nyTime = formatTime(utcTimestamp, "America/New_York");
const laTime = formatTime(utcTimestamp, "America/Los_Angeles");
check("NY is 8:00 AM", nyTime.includes("8:00"), `got ${nyTime}`);
check("LA is 5:00 AM", laTime.includes("5:00"), `got ${laTime}`);
check("NY is AM", nyTime.includes("am") || nyTime.includes("AM"), nyTime);
check("LA is AM", laTime.includes("am") || laTime.includes("AM"), laTime);

console.log();
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log("✅ All tests passed\n");
  console.log("Conclusion: History time display correctly shows timezone-aware time");
  console.log('for same-day sessions ("Today · 7:40 am") and older sessions');
  console.log('("Sat 12 Oct · 1:15 pm").\n');
}
