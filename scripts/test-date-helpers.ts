/**
 * Test date helpers used in close-stale.ts
 * 
 *   npx tsx scripts/test-date-helpers.ts
 * 
 * Timezone-independent: all timestamps use explicit UTC (Z suffix).
 * Passes with TZ=UTC and TZ=Asia/Kolkata.
 */

import { parseIsoMs, secondsSinceIso } from "../src/lib/dates";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. parseIsoMs converts ISO timestamp to milliseconds");
{
  const iso = "2026-10-24T10:00:00.000Z";
  const ms = parseIsoMs(iso);
  
  check("returns a number", typeof ms === "number");
  check("matches Date.parse", ms === Date.parse(iso));
}

console.log("\n2. secondsSinceIso calculates elapsed seconds");
{
  const iso = "2026-10-24T10:00:00.000Z";
  const nowMs = Date.parse("2026-10-24T11:00:00.000Z");
  const elapsed = secondsSinceIso(iso, nowMs);
  
  check("1 hour = 3600 seconds", elapsed === 3600);
}

console.log("\n3. secondsSinceIso handles fractional seconds");
{
  const iso = "2026-10-24T10:00:00.000Z";
  const nowMs = Date.parse("2026-10-24T10:00:30.500Z");
  const elapsed = secondsSinceIso(iso, nowMs);
  
  check("30.5 seconds", elapsed === 30.5);
}

console.log("\n4. secondsSinceIso handles 6 hour threshold");
{
  const iso = "2026-10-24T10:00:00.000Z";
  const nowMs = Date.parse("2026-10-24T16:00:00.000Z");
  const elapsed = secondsSinceIso(iso, nowMs);
  
  check("6 hours = 21600 seconds", elapsed === 21600);
}

console.log("\n5. secondsSinceIso handles 6 hour + 1 second");
{
  const iso = "2026-10-24T10:00:00.000Z";
  const nowMs = Date.parse("2026-10-24T16:00:01.000Z");
  const elapsed = secondsSinceIso(iso, nowMs);
  
  check("21601 seconds", elapsed === 21601);
}

console.log("\n6. j1: parseIsoMs handles offset form (+05:30) under any timezone");
{
  const offsetIso = "2026-10-24T15:30:00+05:30";
  const ms = parseIsoMs(offsetIso);
  
  // 2026-10-24T15:30:00+05:30 = 2026-10-24T10:00:00Z
  const expectedEpoch = Date.parse("2026-10-24T10:00:00.000Z");
  check("offset form parses to correct epoch", ms === expectedEpoch);
  check("matches Date.parse", ms === Date.parse(offsetIso));
}

console.log("\n7. j1: secondsSinceIso handles offset form timestamps");
{
  const offsetStart = "2026-10-24T15:30:00+05:30";
  const offsetEnd = "2026-10-24T17:00:00+05:30";
  const elapsed = secondsSinceIso(offsetStart, Date.parse(offsetEnd));
  
  check("1.5 hours = 5400 seconds", elapsed === 5400);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
