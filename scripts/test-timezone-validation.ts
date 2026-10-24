/**
 * Test: Timezone validation and canonicalization with real IANA zones
 *
 * Verifies:
 * - Accepts valid IANA zones with hyphens (America/Port-au-Prince)
 * - Accepts multi-level zones with underscores (America/Argentina/Buenos_Aires)
 * - Canonicalizes legacy aliases (Asia/Calcutta → Asia/Kolkata)
 * - Rejects abbreviations (EST, PST)
 * - Rejects offset formats (Etc/GMT+5, +05:30)
 * - Rejects junk strings (Foo/Bar)
 * - Rejects path traversal attempts (../etc)
 */

import { validateTimezone } from "../src/lib/branding";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testValidZonesAccepted() {
  console.log("\n▶ Testing valid IANA timezones...");

  const validZones = [
    { input: "UTC", expected: "UTC" },
    { input: "America/New_York", expected: "America/New_York" },
    { input: "America/Los_Angeles", expected: "America/Los_Angeles" },
    { input: "America/Port-au-Prince", expected: "America/Port-au-Prince" },
    { input: "America/Blanc-Sablon", expected: "America/Blanc-Sablon" },
    { input: "America/Argentina/Buenos_Aires", expected: "America/Argentina/Buenos_Aires" },
    { input: "Asia/Kolkata", expected: "Asia/Kolkata" },
    { input: "Europe/London", expected: "Europe/London" },
    { input: "Europe/Kyiv", expected: "Europe/Kyiv" },
    { input: "Pacific/Auckland", expected: "Pacific/Auckland" },
  ];

  for (const { input, expected } of validZones) {
    const result = validateTimezone(input);
    assert(
      result === expected,
      `Valid timezone "${input}" should return "${expected}" (got: ${result})`
    );
  }

  console.log(`  ✓ All ${validZones.length} valid timezones accepted`);
}

function testAliasesAreCanonicalized() {
  console.log("\n▶ Testing legacy alias canonicalization...");

  const aliases = [
    { input: "Asia/Calcutta", expected: "Asia/Kolkata" },
    { input: "Europe/Kiev", expected: "Europe/Kyiv" },
    { input: "Asia/Saigon", expected: "Asia/Ho_Chi_Minh" },
    { input: "GMT", expected: "UTC" },
    { input: "Etc/GMT", expected: "UTC" },
    { input: "Etc/UTC", expected: "UTC" },
  ];

  for (const { input, expected } of aliases) {
    const result = validateTimezone(input);
    assert(
      result === expected,
      `Legacy alias "${input}" should canonicalize to "${expected}" (got: ${result})`
    );
  }

  console.log(`  ✓ All ${aliases.length} aliases canonicalized correctly`);
}

function testInvalidZonesRejected() {
  console.log("\n▶ Testing invalid timezone strings...");

  const invalidZones = [
    "Foo/Bar",              // not a real timezone
    "../etc",               // path traversal
    "../../passwd",         // path traversal
    "America/New York",     // space
    "America/New.York",     // dot
    "",                     // empty
    "not-a-zone",           // junk string
    "EST",                  // abbreviation (now rejected)
    "PST",                  // abbreviation (now rejected)
    "IST",                  // abbreviation (now rejected)
    "CET",                  // abbreviation (now rejected)
    "Etc/GMT+5",            // offset format (now rejected)
    "Etc/GMT-5",            // offset format (now rejected)
    "+05:30",               // offset format (now rejected)
    "-08:00",               // offset format (now rejected)
    "GMT+5",                // offset format (now rejected)
  ];

  for (const tz of invalidZones) {
    const result = validateTimezone(tz);
    assert(
      result === null,
      `Invalid timezone "${tz}" should be rejected (got: ${result})`
    );
  }

  console.log(`  ✓ All ${invalidZones.length} invalid strings rejected`);
}

function testNullAndUndefined() {
  console.log("\n▶ Testing null and undefined...");

  assert(
    validateTimezone(null) === null,
    "null should return null"
  );
  assert(
    validateTimezone(undefined) === null,
    "undefined should return null"
  );

  console.log("  ✓ null and undefined handled correctly");
}

function main() {
  console.log("Testing timezone validation and canonicalization...");

  try {
    testValidZonesAccepted();
    testAliasesAreCanonicalized();
    testInvalidZonesRejected();
    testNullAndUndefined();
    console.log("\n✅ All timezone validation and canonicalization tests passed!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Timezone validation tests failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
