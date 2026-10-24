/**
 * Test blockStartDate timezone arithmetic (X11).
 *
 * Kills: X11
 *
 *   npm run test:block-start-date-tz
 */
import { blockStartDate } from "../src/lib/program/persist";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function runTests() {
  console.log("\nX11: Block start date uses user's local date, not UTC");
  
  // Test 1: Asia/Kolkata at 8 PM UTC on 2026-10-24 is 1:30 AM on 2026-10-25
  const kolkataDate = blockStartDate(new Date("2026-10-24T20:00:00Z"), "Asia/Kolkata");
  check("Asia/Kolkata 8PM UTC → 2026-10-25", kolkataDate === "2026-10-25", `got ${kolkataDate}`);
  
  // Test 2: UTC user at 8 PM UTC on 2026-10-24 is still 2026-10-24
  const utcDate = blockStartDate(new Date("2026-10-24T20:00:00Z"), "UTC");
  check("UTC 8PM UTC → 2026-10-24", utcDate === "2026-10-24", `got ${utcDate}`);
  
  // Test 3: America/Los_Angeles at 8 PM UTC on 2026-10-24 is 1 PM on 2026-10-24
  const laDate = blockStartDate(new Date("2026-10-24T20:00:00Z"), "America/Los_Angeles");
  check("America/Los_Angeles 8PM UTC → 2026-10-24", laDate === "2026-10-24", `got ${laDate}`);
  
  // Test 4: Sydney at 11 PM UTC on 2026-10-24 is 10 AM on 2026-10-25 (AEDT)
  const sydneyDate = blockStartDate(new Date("2026-10-24T23:00:00Z"), "Australia/Sydney");
  check("Australia/Sydney 11PM UTC → 2026-10-25", sydneyDate === "2026-10-25", `got ${sydneyDate}`);
  
  // Test 5: Tokyo at 3 PM UTC on 2026-10-24 is midnight on 2026-10-25
  const tokyoDate = blockStartDate(new Date("2026-10-24T15:00:00Z"), "Asia/Tokyo");
  check("Asia/Tokyo 3PM UTC → 2026-10-25", tokyoDate === "2026-10-25", `got ${tokyoDate}`);
}

runTests();

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed");
}
