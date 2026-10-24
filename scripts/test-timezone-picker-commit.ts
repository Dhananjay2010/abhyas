#!/usr/bin/env tsx
/**
 * QA Issue #7: Test timezone picker commit/cancel logic.
 * 
 * Escape key must CANCEL: restore previous value, call no onChange, blur without committing.
 * Test extracted decideTimezoneCommit with various inputs including Escape case.
 */

import { decideTimezoneCommit } from "../src/app/settings/timezone-picker-logic";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("\nTimezone Picker Commit/Cancel Logic Tests (QA Issue #7)");
console.log("======================================================\n");

const timezones = ["America/New_York", "Asia/Kolkata", "Europe/Kyiv", "UTC"];
const deviceZone = "America/New_York";
const gymDefault = "Asia/Kolkata";

console.log("1. Escape key always cancels (no commit)\n");

check(
  "Escape with valid input → cancel",
  decideTimezoneCommit("Asia/Kolkata", timezones, deviceZone, gymDefault, true).commit === false
);

check(
  "Escape with invalid input → cancel",
  decideTimezoneCommit("InvalidZone", timezones, deviceZone, gymDefault, true).commit === false
);

check(
  "Escape with empty input → cancel",
  decideTimezoneCommit("", timezones, deviceZone, gymDefault, true).commit === false
);

console.log("\n2. Valid timezone commits with canonical value\n");

const validCommit1 = decideTimezoneCommit("Asia/Kolkata", timezones, deviceZone, gymDefault, false);
check(
  "Asia/Kolkata → commit with Asia/Kolkata",
  validCommit1.commit === true && validCommit1.commit && validCommit1.value === "Asia/Kolkata"
);

const validCommit2 = decideTimezoneCommit("UTC", timezones, deviceZone, gymDefault, false);
check(
  "UTC → commit with UTC",
  validCommit2.commit === true && validCommit2.commit && validCommit2.value === "UTC"
);

console.log("\n3. Case-insensitive and alias canonicalization\n");

const canonCommit1 = decideTimezoneCommit("utc", timezones, deviceZone, gymDefault, false);
check(
  "utc (lowercase) → commit with UTC",
  canonCommit1.commit === true && canonCommit1.commit && canonCommit1.value === "UTC"
);

const canonCommit2 = decideTimezoneCommit("asia/kolkata", timezones, deviceZone, gymDefault, false);
check(
  "asia/kolkata (lowercase) → commit with Asia/Kolkata",
  canonCommit2.commit === true && canonCommit2.commit && canonCommit2.value === "Asia/Kolkata"
);

const canonCommit3 = decideTimezoneCommit("Asia/Calcutta", timezones, deviceZone, gymDefault, false);
check(
  "Asia/Calcutta (alias) → commit with Asia/Kolkata",
  canonCommit3.commit === true && canonCommit3.commit && canonCommit3.value === "Asia/Kolkata"
);

console.log("\n4. Special options\n");

const deviceCommit1 = decideTimezoneCommit(
  `Use this device's zone (${deviceZone})`,
  timezones,
  deviceZone,
  gymDefault,
  false
);
check(
  "Device zone label → commit with device zone",
  deviceCommit1.commit === true && deviceCommit1.commit && deviceCommit1.value === deviceZone
);

const deviceCommit2 = decideTimezoneCommit(deviceZone, timezones, deviceZone, gymDefault, false);
check(
  "Device zone direct → commit with device zone",
  deviceCommit2.commit === true && deviceCommit2.commit && deviceCommit2.value === deviceZone
);

const gymCommit1 = decideTimezoneCommit(
  `Gym default (${gymDefault})`,
  timezones,
  deviceZone,
  gymDefault,
  false
);
check(
  "Gym default label → commit with null",
  gymCommit1.commit === true && gymCommit1.commit && gymCommit1.value === null
);

const gymCommit2 = decideTimezoneCommit("", timezones, deviceZone, gymDefault, false);
check(
  "Empty string → commit with null",
  gymCommit2.commit === true && gymCommit2.commit && gymCommit2.value === null
);

console.log("\n5. Invalid input does not commit\n");

check(
  "InvalidZone → no commit",
  decideTimezoneCommit("InvalidZone", timezones, deviceZone, gymDefault, false).commit === false
);

check(
  "EST (abbreviation) → no commit",
  decideTimezoneCommit("EST", timezones, deviceZone, gymDefault, false).commit === false
);

check(
  "Etc/GMT+5 (offset) → no commit",
  decideTimezoneCommit("Etc/GMT+5", timezones, deviceZone, gymDefault, false).commit === false
);

console.log("\n6. Escape overrides valid input (always cancels)\n");

// Even if the input is valid, Escape means cancel
const escapeValid = decideTimezoneCommit("UTC", timezones, deviceZone, gymDefault, true);
check(
  "UTC with Escape → cancel (not commit)",
  escapeValid.commit === false
);

console.log(
  `\n${failures === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failures} FAILURES`}\n`
);
process.exit(failures === 0 ? 0 : 1);
