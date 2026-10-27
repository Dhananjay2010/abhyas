import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { formatJoinCodeDate } from "../src/lib/format-join-code-date";

console.log("=== TEST: formatJoinCodeDate ===\n");

// Fixed date for consistent testing: 2026-10-27 14:30:00 UTC
const testDate = new Date("2026-10-27T14:30:00Z");

console.log("TEST: Same output regardless of server TZ (process.env.TZ)");
// The formatter should produce the same output regardless of what process.env.TZ is set to
// We spawn child processes with different TZ values to prove TZ doesn't affect results

function formatInChildProcess(isoDate: string, targetTimezone: string, processTZ: string): string {
  const result = spawnSync(
    "tsx",
    ["scripts/test-format-join-code-date-child.ts", isoDate, targetTimezone],
    {
      env: { ...process.env, TZ: processTZ },
      encoding: "utf-8",
    }
  );
  
  if (result.status !== 0) {
    throw new Error(`Child process failed: ${result.stderr}`);
  }
  
  return result.stdout.trim();
}

const testDateISO = testDate.toISOString();

// Format UTC timezone under different process TZ values
const utcUnderUTC = formatInChildProcess(testDateISO, "UTC", "UTC");
const utcUnderPacific = formatInChildProcess(testDateISO, "UTC", "America/Los_Angeles");
const utcUnderKolkata = formatInChildProcess(testDateISO, "UTC", "Asia/Kolkata");

console.log(`  UTC timezone under process.env.TZ=UTC: "${utcUnderUTC}"`);
console.log(`  UTC timezone under process.env.TZ=America/Los_Angeles: "${utcUnderPacific}"`);
console.log(`  UTC timezone under process.env.TZ=Asia/Kolkata: "${utcUnderKolkata}"`);

assert.strictEqual(utcUnderUTC, utcUnderPacific, "FAIL: UTC output should be identical under different process TZ");
assert.strictEqual(utcUnderUTC, utcUnderKolkata, "FAIL: UTC output should be identical under different process TZ");
assert.strictEqual(utcUnderUTC, "27 Oct 2026", "FAIL: UTC should show 27 Oct 2026");

console.log("  ✓ Output is identical regardless of process.env.TZ\n");

console.log("TEST: Different target timezones produce correct output");
// Now test that different target timezones still work correctly (all under same process TZ)
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

console.log("TEST: Midnight boundary under different process TZ");
// Test a date around midnight, formatted under different process.env.TZ values
// 2026-10-28 00:30:00 UTC (just after midnight UTC)
const midnightDate = new Date("2026-10-28T00:30:00Z");
const midnightDateISO = midnightDate.toISOString();

// Format America/Los_Angeles timezone under different process TZ values
// (00:30 UTC = 17:30 PDT Oct 27 - crosses midnight boundary)
const pacificUnderUTC = formatInChildProcess(midnightDateISO, "America/Los_Angeles", "UTC");
const pacificUnderPacific = formatInChildProcess(midnightDateISO, "America/Los_Angeles", "America/Los_Angeles");
const pacificUnderKolkata = formatInChildProcess(midnightDateISO, "America/Los_Angeles", "Asia/Kolkata");

console.log(`  Pacific (00:30 UTC = 17:30 PDT Oct 27):`);
console.log(`    under process.env.TZ=UTC: "${pacificUnderUTC}"`);
console.log(`    under process.env.TZ=America/Los_Angeles: "${pacificUnderPacific}"`);
console.log(`    under process.env.TZ=Asia/Kolkata: "${pacificUnderKolkata}"`);

assert.strictEqual(pacificUnderUTC, pacificUnderPacific, "FAIL: Pacific output should be identical under different process TZ");
assert.strictEqual(pacificUnderUTC, pacificUnderKolkata, "FAIL: Pacific output should be identical under different process TZ");
assert.strictEqual(pacificUnderUTC, "27 Oct 2026", "FAIL: Pacific should be 27 Oct 2026 (previous day)");

console.log("  ✓ Midnight boundary handled correctly regardless of process TZ\n");

console.log("✅ All formatJoinCodeDate tests passed");
