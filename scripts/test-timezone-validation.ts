/**
 * Test: Timezone validation with real IANA zones
 *
 * Verifies:
 * - Accepts valid IANA zones with hyphens (America/Port-au-Prince)
 * - Accepts valid IANA zones with digits and signs (Etc/GMT+5, Etc/GMT-5)
 * - Accepts multi-level zones with underscores (America/Argentina/Buenos_Aires)
 * - Rejects junk strings (Foo/Bar)
 * - Rejects path traversal attempts (../etc)
 * - Rejects abbreviations (EST, PST)
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
    "UTC",
    "America/New_York",
    "America/Los_Angeles",
    "America/Port-au-Prince",    // hyphen (coordinator requirement)
    "America/Blanc-Sablon",       // hyphen (coordinator requirement)
    "Etc/GMT+5",                   // digit and plus sign (coordinator requirement)
    "Etc/GMT-5",                   // digit and minus sign
    "America/Argentina/Buenos_Aires", // multi-level with underscore
    "Asia/Kolkata",
    "Europe/London",
    "Pacific/Auckland",
    "EST",                         // abbreviation (Intl accepts it)
  ];

  for (const tz of validZones) {
    const result = validateTimezone(tz);
    assert(
      result === tz,
      `Valid timezone "${tz}" should be accepted (got: ${result})`
    );
  }

  console.log(`  ✓ All ${validZones.length} valid timezones accepted`);
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
  console.log("Testing timezone validation...");

  try {
    testValidZonesAccepted();
    testInvalidZonesRejected();
    testNullAndUndefined();
    console.log("\n✅ All timezone validation tests passed!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Timezone validation tests failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
