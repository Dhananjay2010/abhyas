/**
 * Unit tests for timezone canonicalization and validation in user settings.
 *
 * Tests the REAL canonicalizeTimezone and sanitizeTimezonePatch functions to verify:
 * - Valid IANA timezones are accepted and canonicalized
 * - Case is fixed (asia/kolkata → Asia/Kolkata)
 * - Legacy aliases are mapped (Asia/Calcutta → Asia/Kolkata)
 * - Abbreviations are rejected (EST, PST, IST)
 * - Offsets are rejected (+05:30, GMT+5)
 * - null is accepted (means "use gym default")
 * - Invalid timezone strings are rejected with a user-facing error
 * - Server-side validation prevents database writes when timezone is invalid
 * - The action stores the canonical return value, not the raw input
 *
 * Uses real code with injectable dependencies (no simulation or mocking).
 */

import { canonicalizeTimezone } from "../src/lib/timezone-canonical";
import { sanitizeTimezonePatch } from "../src/lib/timezone-patch";
import { validateAndUpdateProfile } from "../src/app/settings/profile-update-logic";
import type { Database } from "../src/lib/database.types";

export {}; // Make this a module to avoid global scope conflicts

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nTimezone canonicalization and validation tests");
console.log("==============================================\n");

async function runTests() {
  console.log("1. canonicalizeTimezone fixes case");
  {
    const result = canonicalizeTimezone("asia/kolkata");
    check('"asia/kolkata" → "Asia/Kolkata"', result === "Asia/Kolkata");
  }
  {
    const result = canonicalizeTimezone("america/new_york");
    check('"america/new_york" → "America/New_York"', result === "America/New_York");
  }
  {
    const result = canonicalizeTimezone("EUROPE/LONDON");
    check('"EUROPE/LONDON" → "Europe/London"', result === "Europe/London");
  }

  console.log("\n2. canonicalizeTimezone maps legacy aliases");
  {
    const result = canonicalizeTimezone("Asia/Calcutta");
    check('"Asia/Calcutta" → "Asia/Kolkata"', result === "Asia/Kolkata");
  }
  {
    const result = canonicalizeTimezone("US/Pacific");
    check('"US/Pacific" → "America/Los_Angeles"', result === "America/Los_Angeles");
  }
  {
    const result = canonicalizeTimezone("US/Eastern");
    check('"US/Eastern" → "America/New_York"', result === "America/New_York");
  }
  {
    const result = canonicalizeTimezone("GMT");
    check('"GMT" → "UTC"', result === "UTC");
  }
  {
    const result = canonicalizeTimezone("Etc/GMT");
    check('"Etc/GMT" → "UTC"', result === "UTC");
  }

  console.log("\n3. canonicalizeTimezone preserves UTC and handles case");
  {
    const result = canonicalizeTimezone("UTC");
    check('"UTC" stays "UTC"', result === "UTC");
  }
  {
    const result = canonicalizeTimezone("utc");
    check('"utc" becomes "UTC"', result === "UTC");
  }
  {
    const result = canonicalizeTimezone("Utc");
    check('"Utc" becomes "UTC"', result === "UTC");
  }

  console.log("\n4. canonicalizeTimezone rejects abbreviations");
  {
    const result = canonicalizeTimezone("EST");
    check('rejects "EST" (abbreviation)', result === null);
  }
  {
    const result = canonicalizeTimezone("PST");
    check('rejects "PST" (abbreviation)', result === null);
  }
  {
    const result = canonicalizeTimezone("IST");
    check('rejects "IST" (abbreviation)', result === null);
  }
  {
    const result = canonicalizeTimezone("CET");
    check('rejects "CET" (abbreviation)', result === null);
  }

  console.log("\n5. canonicalizeTimezone rejects offsets");
  {
    const result = canonicalizeTimezone("+05:30");
    check('rejects "+05:30" (offset)', result === null);
  }
  {
    const result = canonicalizeTimezone("GMT+5");
    check('rejects "GMT+5" (offset)', result === null);
  }
  {
    const result = canonicalizeTimezone("UTC-8");
    check('rejects "UTC-8" (offset)', result === null);
  }
  {
    const result = canonicalizeTimezone("Etc/GMT+5");
    check('rejects "Etc/GMT+5" (offset)', result === null);
  }
  {
    const result = canonicalizeTimezone("Etc/GMT-14");
    check('rejects "Etc/GMT-14" (offset)', result === null);
  }

  console.log("\n6. canonicalizeTimezone accepts zones with hyphens");
  {
    const result = canonicalizeTimezone("America/Port-au-Prince");
    check('accepts "America/Port-au-Prince"', result === "America/Port-au-Prince");
  }
  {
    const result = canonicalizeTimezone("America/Blanc-Sablon");
    check('accepts "America/Blanc-Sablon"', result === "America/Blanc-Sablon");
  }

  console.log("\n7. canonicalizeTimezone rejects invalid timezones");
  {
    const result = canonicalizeTimezone("Mars/Olympus");
    check('rejects "Mars/Olympus"', result === null);
  }
  {
    const result = canonicalizeTimezone("not a zone");
    check('rejects "not a zone"', result === null);
  }
  {
    const longString = "a".repeat(500);
    const result = canonicalizeTimezone(longString);
    check("rejects 500-char string", result === null);
  }
  {
    const result = canonicalizeTimezone("'; drop table");
    check('rejects "\'; drop table"', result === null);
  }

  console.log("\n8. canonicalizeTimezone trims whitespace");
  {
    const result = canonicalizeTimezone("  Asia/Kolkata  ");
    check('trims "  Asia/Kolkata  " → "Asia/Kolkata"', result === "Asia/Kolkata");
  }
  {
    const result = canonicalizeTimezone("\tAmerica/New_York\n");
    check('trims "\\tAmerica/New_York\\n" → "America/New_York"', result === "America/New_York");
  }

  console.log("\n9. sanitizeTimezonePatch accepts null (gym default)");
  {
    const result = sanitizeTimezonePatch(null);
    check("accepts null", result.ok === true && result.timezone === null);
  }
  {
    const result = sanitizeTimezonePatch(undefined);
    check("accepts undefined", result.ok === true && result.timezone === null);
  }

  console.log("\n10. sanitizeTimezonePatch returns canonical values");
  {
    const result = sanitizeTimezonePatch("asia/kolkata");
    check(
      'canonicalizes "asia/kolkata" → "Asia/Kolkata"',
      result.ok === true && result.timezone === "Asia/Kolkata"
    );
  }
  {
    const result = sanitizeTimezonePatch("Asia/Calcutta");
    check(
      'maps "Asia/Calcutta" → "Asia/Kolkata"',
      result.ok === true && result.timezone === "Asia/Kolkata"
    );
  }
  {
    const result = sanitizeTimezonePatch("US/Pacific");
    check(
      'maps "US/Pacific" → "America/Los_Angeles"',
      result.ok === true && result.timezone === "America/Los_Angeles"
    );
  }

  console.log("\n11. sanitizeTimezonePatch rejects invalid values");
  {
    const result = sanitizeTimezonePatch("EST");
    check('rejects "EST"', result.ok === false);
  }
  {
    const result = sanitizeTimezonePatch("+05:30");
    check('rejects "+05:30"', result.ok === false);
  }
  {
    const result = sanitizeTimezonePatch("Etc/GMT+5");
    check('rejects "Etc/GMT+5"', result.ok === false);
  }
  {
    const result = sanitizeTimezonePatch("Mars/Olympus");
    check('rejects "Mars/Olympus"', result.ok === false);
    if (result.ok === false) {
      check("error message is user-facing", result.error.includes("Invalid timezone"));
    }
  }

  console.log("\n12. Empty string handling");
  console.log("  Note: The settings form converts empty string to null before calling the action.");
  console.log("  See settings-form.tsx line 560: const v = e.target.value === '' ? null : e.target.value;");
  {
    const result = sanitizeTimezonePatch("");
    check('rejects "" (empty string)', result.ok === false);
    console.log("  ^ This is expected: the form converts '' → null before calling the action.");
  }

  console.log("\n13. Action stores canonical value, not raw input");
  {
    // Test that when we pass a lowercase or legacy value, the sanitizer
    // returns the canonical form, proving the action will store that
    const testCases = [
      { input: "asia/kolkata", expected: "Asia/Kolkata", canonicalized: true },
      { input: "Asia/Calcutta", expected: "Asia/Kolkata", canonicalized: true },
      { input: "US/Pacific", expected: "America/Los_Angeles", canonicalized: true },
      { input: "  Europe/London  ", expected: "Europe/London", canonicalized: false }, // Only trimmed
    ];

    for (const { input, expected, canonicalized } of testCases) {
      const result = sanitizeTimezonePatch(input);
      if (canonicalized) {
        // For inputs that get transformed (case fix or alias mapping),
        // verify the output differs from the trimmed input
        check(
          `stores canonical for "${input}" (transformed)`,
          result.ok === true && result.timezone === expected && result.timezone !== input.trim()
        );
      } else {
        // For inputs that only get trimmed, just verify correct output
        check(
          `stores canonical for "${input}" (trimmed)`,
          result.ok === true && result.timezone === expected
        );
      }
    }
  }

  console.log("\n14. Undefined timezone doesn't reset to gym default");
  {
    // When timezone is undefined in the patch, the action should skip validation
    // and not include timezone in the DB update, preserving the user's current value
    const result = sanitizeTimezonePatch(undefined);
    check("undefined is treated as null by sanitizer", result.ok === true && result.timezone === null);
    console.log("  Note: The action checks patch.timezone !== undefined before calling the sanitizer.");
    console.log("  When undefined, the timezone key is not included in the DB update at all.");
  }

  console.log("\n15. All UTC-equivalent names map to 'UTC'");
  {
    const utcEquivalents = [
      "UTC", "Etc/UTC", "GMT", "Etc/GMT", "Etc/GMT0", "GMT0",
      "Etc/GMT-0", "Etc/GMT+0", "GMT-0", "GMT+0",
      "Etc/Universal", "Universal", "Etc/Zulu", "Zulu",
      "Greenwich", "Etc/Greenwich", "UCT", "Etc/UCT"
    ];

    for (const input of utcEquivalents) {
      const result = canonicalizeTimezone(input);
      check(`${input} → UTC`, result === "UTC");
      
      // Test case variations
      const lower = canonicalizeTimezone(input.toLowerCase());
      check(`${input.toLowerCase()} → UTC (lowercase)`, lower === "UTC");
    }
  }

  console.log("\n16. Legacy ICU names map to modern IANA names");
  {
    const legacyMappings: [string, string][] = [
      ["Atlantic/Faeroe", "Atlantic/Faroe"],
      ["America/Godthab", "America/Nuuk"],
      ["Pacific/Ponape", "Pacific/Pohnpei"],
      ["Pacific/Truk", "Pacific/Chuuk"],
      ["America/Indianapolis", "America/Indiana/Indianapolis"],
    ];

    for (const [input, expected] of legacyMappings) {
      const result = canonicalizeTimezone(input);
      check(`${input} → ${expected}`, result === expected);
      
      // Test case variations
      const lower = canonicalizeTimezone(input.toLowerCase());
      check(`${input.toLowerCase()} → ${expected} (lowercase)`, lower === expected);
    }

    // Also verify modern names pass through unchanged
    const modernNames = ["Atlantic/Faroe", "America/Nuuk", "Pacific/Pohnpei", "Pacific/Chuuk", "America/Indiana/Indianapolis"];
    for (const name of modernNames) {
      const result = canonicalizeTimezone(name);
      check(`${name} → ${name} (modern form)`, result === name);
    }
  }

  console.log("\n17. Offset handling: real offsets rejected, zero-offset accepted");
  {
    const rejectedOffsets = [
      "Etc/GMT+5", "GMT-14", "+05:30", "-08:00", "UTC+5", "GMT+1"
    ];

    for (const input of rejectedOffsets) {
      const result = canonicalizeTimezone(input);
      check(`rejects ${input} (real offset)`, result === null);
    }

    const acceptedZeroOffsets: [string, string][] = [
      ["GMT-0", "UTC"],
      ["GMT+0", "UTC"],
      ["Etc/GMT-0", "UTC"],
      ["Etc/GMT+0", "UTC"],
    ];

    for (const [input, expected] of acceptedZeroOffsets) {
      const result = canonicalizeTimezone(input);
      check(`${input} → ${expected} (zero offset)`, result === expected);
    }
  }

  console.log("\n18. All canonical outputs accepted by Intl");
  {
    const allAliases = [
      "UTC", "Etc/UTC", "GMT", "Etc/GMT", "Etc/GMT0", "GMT0",
      "Atlantic/Faroe", "America/Nuuk", "Pacific/Pohnpei", "Pacific/Chuuk", 
      "America/Indiana/Indianapolis", "Asia/Kolkata", "Asia/Ho_Chi_Minh",
      "Asia/Kathmandu", "Asia/Yangon", "Europe/Kyiv", "America/Argentina/Buenos_Aires"
    ];

    for (const alias of allAliases) {
      const canonical = canonicalizeTimezone(alias);
      if (canonical !== null) {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: canonical });
          check(`${alias} → ${canonical} accepted by Intl`, true);
        } catch (e) {
          check(`${alias} → ${canonical} accepted by Intl`, false);
        }
      }
    }
  }

  console.log("\n19. Server-side validation prevents database writes on invalid input");
  {
    // The sanitizer rejects invalid values before they reach the DB
    const invalidInputs = ["InvalidZone123", "EST", "+05:30", "Mars/Olympus", "Etc/GMT+5"];

    for (const input of invalidInputs) {
      const result = sanitizeTimezonePatch(input);
      check(`sanitizer blocks "${input}" before DB write`, result.ok === false);
    }
  }

  console.log("\n20. Profile update logic with dependency injection");
  {
    // Test that invalid timezone prevents DB write
    let updateCalled = false;
    const invalidPatch: ProfileUpdate = { timezone: "InvalidZone123" };

    const invalidResult = await validateAndUpdateProfile(invalidPatch, {
      updateProfile: async () => {
        updateCalled = true;
        return { ok: true };
      },
    });

    check("invalid timezone returns error", !invalidResult.ok);
    check("invalid timezone does NOT call updateProfile", !updateCalled);

    // Test that valid timezone calls updateProfile with canonical value
    let updateCalledWithCanonical = false;
    let capturedTimezone: string | null | undefined = undefined;
    const validPatch: ProfileUpdate = { timezone: "asia/kolkata" };

    const validResult = await validateAndUpdateProfile(validPatch, {
      updateProfile: async (patch) => {
        updateCalledWithCanonical = true;
        capturedTimezone = patch.timezone;
        return { ok: true };
      },
    });

    check("valid timezone returns success", validResult.ok === true);
    check("valid timezone DOES call updateProfile", updateCalledWithCanonical);
    check(
      "updateProfile receives canonical value",
      capturedTimezone === "Asia/Kolkata"
    );

    // Test that undefined timezone skips validation and calls updateProfile
    let updateCalledForUndefined = false;
    let capturedHasTimezone = false;
    const patchWithUndefined: ProfileUpdate = { goal: "strength" }; // No timezone key

    const undefinedResult = await validateAndUpdateProfile(patchWithUndefined, {
      updateProfile: async (patch) => {
        updateCalledForUndefined = true;
        capturedHasTimezone = "timezone" in patch;
        return { ok: true };
      },
    });

    check("undefined timezone returns success", undefinedResult.ok === true);
    check("undefined timezone DOES call updateProfile", updateCalledForUndefined);
    check("updateProfile does not receive timezone key", !capturedHasTimezone);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests();
