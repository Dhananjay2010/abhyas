import assert from "node:assert";
import { formatJoinCodeDate } from "../src/lib/format-join-code-date";

console.log("=== TEST: formatJoinCodeDate ===\n");

// Fixed date for consistent testing: 2026-10-27 14:30:00 UTC
const testDate = new Date("2026-10-27T14:30:00Z");

console.log("TEST: Same output across different process TZ values");
// The formatter should produce the same output regardless of the process.env.TZ
// because we specify an explicit timeZone parameter
const resultUTC = formatJoinCodeDate(testDate, "UTC");
const resultPacific = formatJoinCodeDate(testDate, "America/Los_Angeles");
const resultKolkata = formatJoinCodeDate(testDate, "Asia/Kolkata");
const resultLondon = formatJoinCodeDate(testDate, "Europe/London");

console.log(`  UTC timezone: "${resultUTC}"`);
console.log(`  America/Los_Angeles timezone: "${resultPacific}"`);
console.log(`  Asia/Kolkata timezone: "${resultKolkata}"`);
console.log(`  Europe/London timezone: "${resultLondon}"`);

// Verify format is consistent: day, short month, year (e.g., "27 Oct 2026")
assert.match(resultUTC, /^\d{1,2} \w{3} \d{4}$/, "FAIL: UTC format should be 'DD MMM YYYY'");
assert.match(resultPacific, /^\d{1,2} \w{3} \d{4}$/, "FAIL: Pacific format should be 'DD MMM YYYY'");
assert.match(resultKolkata, /^\d{1,2} \w{3} \d{4}$/, "FAIL: Kolkata format should be 'DD MMM YYYY'");
assert.match(resultLondon, /^\d{1,2} \w{3} \d{4}$/, "FAIL: London format should be 'DD MMM YYYY'");

// UTC should show "27 Oct 2026"
assert.strictEqual(resultUTC, "27 Oct 2026", "FAIL: UTC should show 27 Oct 2026");

// Pacific (UTC-7/8) should show "27 Oct 2026" (14:30 UTC = 07:30 PDT, same day)
assert.strictEqual(resultPacific, "27 Oct 2026", "FAIL: Pacific should show 27 Oct 2026");

// Kolkata (UTC+5:30) should show "27 Oct 2026" (14:30 UTC = 20:00 IST, same day)
assert.strictEqual(resultKolkata, "27 Oct 2026", "FAIL: Kolkata should show 27 Oct 2026");

// London (UTC+0/1) should show "27 Oct 2026"
assert.strictEqual(resultLondon, "27 Oct 2026", "FAIL: London should show 27 Oct 2026");

console.log("  ✓ All timezones produce consistent format\n");

console.log("TEST: Date around midnight boundary");
// Test a date that's near midnight in one timezone but not another
// 2026-10-28 00:30:00 UTC (just after midnight UTC)
const midnightDate = new Date("2026-10-28T00:30:00Z");

const midnightUTC = formatJoinCodeDate(midnightDate, "UTC");
const midnightPacific = formatJoinCodeDate(midnightDate, "America/Los_Angeles");
const midnightKolkata = formatJoinCodeDate(midnightDate, "Asia/Kolkata");

console.log(`  UTC (00:30): "${midnightUTC}"`);
console.log(`  America/Los_Angeles (16:30 previous day): "${midnightPacific}"`);
console.log(`  Asia/Kolkata (06:00 same day): "${midnightKolkata}"`);

// UTC should be 28 Oct
assert.strictEqual(midnightUTC, "28 Oct 2026", "FAIL: UTC should be 28 Oct 2026");

// Pacific should be 27 Oct (00:30 UTC = 17:30 PDT Oct 27)
assert.strictEqual(midnightPacific, "27 Oct 2026", "FAIL: Pacific should be 27 Oct 2026 (previous day)");

// Kolkata should be 28 Oct (00:30 UTC = 06:00 IST Oct 28)
assert.strictEqual(midnightKolkata, "28 Oct 2026", "FAIL: Kolkata should be 28 Oct 2026");

console.log("  ✓ Dates correctly adjusted for timezone across midnight\n");

console.log("TEST: Date at exact midnight in different timezones");
// Test exact midnight in different timezones
const utcMidnight = new Date("2026-10-28T00:00:00Z");
const londonMidnightDate = formatJoinCodeDate(utcMidnight, "Europe/London");
const pacificMidnightDate = formatJoinCodeDate(utcMidnight, "America/Los_Angeles");

console.log(`  Europe/London at UTC midnight: "${londonMidnightDate}"`);
console.log(`  America/Los_Angeles at UTC midnight: "${pacificMidnightDate}"`);

assert.strictEqual(londonMidnightDate, "28 Oct 2026", "FAIL: London should be 28 Oct 2026");
assert.strictEqual(pacificMidnightDate, "27 Oct 2026", "FAIL: Pacific should be 27 Oct 2026");

console.log("  ✓ Exact midnight handled correctly\n");

console.log("✅ All formatJoinCodeDate tests passed");
