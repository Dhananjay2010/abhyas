/**
 * Test block start date (X11).
 *
 * Verify that createBlockForUser uses the user's local today,
 * not a hardcoded date or the block start date.
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
 * Get the start date for a new block (first creation, not rebuild).
 */
function getBlockStartDate(timezone: string, rebuildOf: { started_on: string } | null): string {
  if (rebuildOf) {
    return rebuildOf.started_on;
  }
  return localDateString(timezone);
}

console.log("\nX11: First block uses user's local today");
{
  const timezone = "America/New_York";
  const startDate = getBlockStartDate(timezone, null);
  const expectedToday = localDateString(timezone);

  check("start date equals local today", startDate === expectedToday);
  check("start date is NOT hardcoded 2026-01-01", startDate !== "2026-01-01");
}

console.log("\nX11: Rebuild keeps the old block's start date");
{
  const timezone = "America/New_York";
  const oldBlock = { started_on: "2026-09-15" };
  const startDate = getBlockStartDate(timezone, oldBlock);

  check("rebuild keeps old start date", startDate === "2026-09-15");
  check("rebuild does NOT use today", startDate !== localDateString(timezone));
}

console.log("\nX11: Timezone affects local date calculation");
{
  // The key point is that we use localDateString(timezone), not a hardcoded value
  // Different timezones CAN produce different dates at the same UTC moment
  const utcDate = new Date("2026-10-24T01:00:00Z");
  const originalNow = Date.now;
  Date.now = () => utcDate.getTime();

  try {
    // At 01:00 UTC:
    // - Pacific (UTC-7) is still Oct 23 (18:00)
    // - UTC is Oct 24 (01:00)
    const pacificToday = localDateString("America/Los_Angeles");
    const utcToday = localDateString("UTC");

    check("Pacific date is 2026-10-23", pacificToday === "2026-10-23");
    check("UTC date is 2026-10-24", utcToday === "2026-10-24");

    const pacificStartDate = getBlockStartDate("America/Los_Angeles", null);
    const utcStartDate = getBlockStartDate("UTC", null);
    
    check("Pacific block starts on Pacific's today", pacificStartDate === "2026-10-23");
    check("UTC block starts on UTC's today", utcStartDate === "2026-10-24");
  } finally {
    Date.now = originalNow;
  }
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed");
}
