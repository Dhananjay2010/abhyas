/**
 * Test session length validation in Settings.
 *
 * Validates:
 * - isAllowedSessionLength rejects invalid values
 * - Settings updateProfileSettings rejects 50 and 90
 * - Only 30, 45, 60, 75 are accepted
 *
 *   npm run test:session-length-validation
 */

import { isAllowedSessionLength, SESSION_LENGTH_OPTIONS } from "../src/lib/onboarding/session-length";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. isAllowedSessionLength accepts valid values");
{
  check("30 is allowed", isAllowedSessionLength(30));
  check("45 is allowed", isAllowedSessionLength(45));
  check("60 is allowed", isAllowedSessionLength(60));
  check("75 is allowed", isAllowedSessionLength(75));
}

console.log("\n2. isAllowedSessionLength rejects invalid values");
{
  check("0 is rejected", !isAllowedSessionLength(0));
  check("15 is rejected", !isAllowedSessionLength(15));
  check("20 is rejected", !isAllowedSessionLength(20));
  check("25 is rejected", !isAllowedSessionLength(25));
  check("35 is rejected", !isAllowedSessionLength(35));
  check("40 is rejected", !isAllowedSessionLength(40));
  check("50 is rejected (QA case)", !isAllowedSessionLength(50));
  check("55 is rejected", !isAllowedSessionLength(55));
  check("65 is rejected", !isAllowedSessionLength(65));
  check("70 is rejected", !isAllowedSessionLength(70));
  check("80 is rejected", !isAllowedSessionLength(80));
  check("90 is rejected (QA case)", !isAllowedSessionLength(90));
  check("100 is rejected", !isAllowedSessionLength(100));
  check("120 is rejected", !isAllowedSessionLength(120));
}

console.log("\n3. isAllowedSessionLength rejects non-numbers");
{
  check("null is rejected", !isAllowedSessionLength(null));
  check("undefined is rejected", !isAllowedSessionLength(undefined));
  check("string '45' is rejected", !isAllowedSessionLength("45"));
  check("NaN is rejected", !isAllowedSessionLength(NaN));
  check("Infinity is rejected", !isAllowedSessionLength(Infinity));
  check("object is rejected", !isAllowedSessionLength({ value: 45 }));
  check("array is rejected", !isAllowedSessionLength([45]));
}

console.log("\n4. isAllowedSessionLength rejects non-integers");
{
  check("30.5 is rejected", !isAllowedSessionLength(30.5));
  check("45.1 is rejected", !isAllowedSessionLength(45.1));
  check("59.9 is rejected", !isAllowedSessionLength(59.9));
  check("60.01 is rejected", !isAllowedSessionLength(60.01));
}

console.log("\n5. isAllowedSessionLength rejects negative values");
{
  check("-30 is rejected", !isAllowedSessionLength(-30));
  check("-45 is rejected", !isAllowedSessionLength(-45));
  check("-1 is rejected", !isAllowedSessionLength(-1));
}

console.log("\n6. Settings action validation (simulated)");
{
  // Simulate the validation logic from updateProfileSettings
  function validateSessionLength(minutes: unknown): { ok: true } | { ok: false; error: string } {
    if (minutes != null && !isAllowedSessionLength(minutes)) {
      return { ok: false, error: "Pick 30, 45, 60 or 75 minutes." };
    }
    return { ok: true };
  }

  const valid30 = validateSessionLength(30);
  check("Settings accepts 30", valid30.ok);

  const valid45 = validateSessionLength(45);
  check("Settings accepts 45", valid45.ok);

  const valid60 = validateSessionLength(60);
  check("Settings accepts 60", valid60.ok);

  const valid75 = validateSessionLength(75);
  check("Settings accepts 75", valid75.ok);

  const invalid50 = validateSessionLength(50);
  check("Settings rejects 50", !invalid50.ok);
  if (!invalid50.ok) {
    check("Settings error message for 50 is correct",
      invalid50.error === "Pick 30, 45, 60 or 75 minutes.");
  }

  const invalid90 = validateSessionLength(90);
  check("Settings rejects 90", !invalid90.ok);
  if (!invalid90.ok) {
    check("Settings error message for 90 is correct",
      invalid90.error === "Pick 30, 45, 60 or 75 minutes.");
  }

  const validNull = validateSessionLength(null);
  check("Settings accepts null (no change)", validNull.ok);
}

console.log("\n7. Single source validation");
{
  // Verify that SESSION_LENGTH_OPTIONS is the single source
  const optionsSet = new Set(SESSION_LENGTH_OPTIONS);
  const expectedValues: (30 | 45 | 60 | 75)[] = [30, 45, 60, 75];

  check("All valid values are in SESSION_LENGTH_OPTIONS",
    expectedValues.every(v => optionsSet.has(v)));

  check("SESSION_LENGTH_OPTIONS has no extra values",
    SESSION_LENGTH_OPTIONS.length === 4);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
