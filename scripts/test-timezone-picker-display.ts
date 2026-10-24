#!/usr/bin/env tsx
/**
 * QA Issue #6: Test timezone picker display value logic.
 * 
 * A stored canonical timezone (Asia/Kolkata) must display as that zone,
 * never as "Gym default". Test extracted getTimezoneDisplayValue with:
 * - Stored Asia/Calcutta (legacy, but might exist in DB)
 * - Stored Asia/Kolkata (canonical)
 * - Stored UTC
 * - Stored null (no explicit choice)
 */

import { getTimezoneDisplayValue } from "../src/app/settings/timezone-picker-logic";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("\nTimezone Picker Display Value Tests (QA Issue #6)");
console.log("=================================================\n");

const gymDefault = "Asia/Kolkata";
const deviceZone = "America/New_York";

console.log("1. null or empty stored value shows 'Gym default'\n");

check(
  "null stored → Gym default",
  getTimezoneDisplayValue(null, deviceZone, gymDefault) === `Gym default (${gymDefault})`
);

check(
  "empty string stored → Gym default",
  getTimezoneDisplayValue("", deviceZone, gymDefault) === `Gym default (${gymDefault})`
);

console.log("\n2. Canonical stored timezone displays as-is (never as Gym default)\n");

check(
  "Asia/Kolkata stored → Asia/Kolkata (not Gym default)",
  getTimezoneDisplayValue("Asia/Kolkata", deviceZone, gymDefault) === "Asia/Kolkata"
);

check(
  "UTC stored → UTC (not Gym default)",
  getTimezoneDisplayValue("UTC", deviceZone, gymDefault) === "UTC"
);

check(
  "Europe/Kyiv stored → Europe/Kyiv",
  getTimezoneDisplayValue("Europe/Kyiv", deviceZone, gymDefault) === "Europe/Kyiv"
);

console.log("\n3. Legacy alias stored (edge case) displays as-is\n");

// Edge case: if somehow a legacy alias got stored (shouldn't happen with new code)
// it should still display as-is, not as Gym default
check(
  "Asia/Calcutta stored → Asia/Calcutta (displayed verbatim)",
  getTimezoneDisplayValue("Asia/Calcutta", deviceZone, gymDefault) === "Asia/Calcutta"
);

console.log("\n4. Device zone match shows special label\n");

check(
  "America/New_York stored (matches device) → special label",
  getTimezoneDisplayValue("America/New_York", "America/New_York", gymDefault) === 
    "Use this device's zone (America/New_York)"
);

check(
  "America/New_York stored (no device zone) → displays as-is",
  getTimezoneDisplayValue("America/New_York", null, gymDefault) === "America/New_York"
);

console.log("\n5. Gym default stored explicitly shows as-is (not special label)\n");

// If user explicitly picks the gym default timezone, it's stored as that string
// and should display as the timezone name, not "Gym default (X)"
check(
  "Asia/Kolkata stored (same as gym default) → Asia/Kolkata",
  getTimezoneDisplayValue("Asia/Kolkata", deviceZone, "Asia/Kolkata") === "Asia/Kolkata"
);

console.log(
  `\n${failures === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failures} FAILURES`}\n`
);
process.exit(failures === 0 ? 0 : 1);
