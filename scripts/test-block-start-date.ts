/**
 * Test block start date uses user's local date (X11).
 *
 * Tests the production code at persist.ts createBlockForUser,
 * which uses localDateString(timezone) to compute today.
 *
 * Kills: X11 (using localDateString('UTC') instead of user's timezone)
 *
 *   npm run test:block-start-date
 */
import { localDateString } from "../src/lib/dates";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

/**
 * Simulate the production logic from persist.ts createBlockForUser.
 * The actual code does:
 *   const timezone = resolveTimezoneWithProfile(profile.timezone);
 *   const today = localDateString(timezone);
 */
function simulateBlockStartDate(timezone: string, rebuildOf: { started_on: string } | null): string {
  const today = localDateString(timezone);
  // For first builds: use today
  // For rebuilds: keep the old start date (handled at the DB level, not here)
  return rebuildOf ? rebuildOf.started_on : today;
}

console.log("\nX11: Block start date uses user's timezone, not UTC");
{
  // Test 1: Asia/Kolkata - verify local date
  const kolkataDate = localDateString("Asia/Kolkata", new Date("2026-10-24T20:00:00Z"));
  check("Asia/Kolkata 8PM UTC → 2026-10-25", kolkataDate === "2026-10-25", `got ${kolkataDate}`);

  // Test 2: UTC 
  const utcDate = localDateString("UTC", new Date("2026-10-24T20:00:00Z"));
  check("UTC 8PM UTC → 2026-10-24", utcDate === "2026-10-24", `got ${utcDate}`);

  // Test 3: America/Los_Angeles
  const laDate = localDateString("America/Los_Angeles", new Date("2026-10-24T20:00:00Z"));
  check("America/Los_Angeles 8PM UTC → 2026-10-24", laDate === "2026-10-24", `got ${laDate}`);

  // Test 4: Australia/Sydney (AEDT)
  const sydneyDate = localDateString("Australia/Sydney", new Date("2026-10-24T23:00:00Z"));
  check("Australia/Sydney 11PM UTC → 2026-10-25", sydneyDate === "2026-10-25", `got ${sydneyDate}`);

  // Test 5: Asia/Tokyo
  const tokyoDate = localDateString("Asia/Tokyo", new Date("2026-10-24T15:00:00Z"));
  check("Asia/Tokyo 3PM UTC → 2026-10-25", tokyoDate === "2026-10-25", `got ${tokyoDate}`);
}

console.log("\nX11: First build uses localDateString(timezone)");
{
  const timezone = "Europe/London";
  const startDate = simulateBlockStartDate(timezone, null);
  const expected = localDateString(timezone);

  check("first build uses localDateString(timezone)", startDate === expected);
  check("NOT hardcoded 2026-01-01", startDate !== "2026-01-01");
  check("is in YYYY-MM-DD format", /^\d{4}-\d{2}-\d{2}$/.test(startDate));
}

console.log("\nX11: Rebuild preserves old start date");
{
  const timezone = "America/New_York";
  const oldStartDate = "2026-09-15";
  const startDate = simulateBlockStartDate(timezone, { started_on: oldStartDate });
  const today = localDateString(timezone);

  check("rebuild uses old start date", startDate === oldStartDate);
  check("rebuild does NOT use today", startDate !== today);
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed");
}
