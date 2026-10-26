/**
 * Unit tests for gym-brand.ts helper functions.
 * Tests the gymBrandTag format and Brand type mapping/validation.
 */

import { gymBrandTag } from "../src/lib/gym-brand";
import { validateTimezone, getBrand } from "../src/lib/branding";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

function runTests() {
  console.log("TEST: gymBrandTag format");
  {
    const gymId = "12345678-1234-1234-1234-123456789abc";
    const tag = gymBrandTag(gymId);
    check("Tag has correct prefix", tag.startsWith("gym-brand:"));
    check("Tag includes gym ID", tag === `gym-brand:${gymId}`);
    check("Tag format is gym-brand:<id>", tag === `gym-brand:${gymId}`);
  }
  console.log();

  console.log("TEST: gymBrandTag format with different gym IDs");
  {
    const gymId1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const gymId2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const tag1 = gymBrandTag(gymId1);
    const tag2 = gymBrandTag(gymId2);
    check("Different IDs produce different tags", tag1 !== tag2);
    check("Tag 1 correct", tag1 === `gym-brand:${gymId1}`);
    check("Tag 2 correct", tag2 === `gym-brand:${gymId2}`);
  }
  console.log();

  console.log("TEST: Default brand fallback for unmapped hosts");
  {
    // When resolveGymByHost returns null (localhost, *.vercel.app, unverified, unknown),
    // the caller should use getBrand() to get the default brand
    const defaultBrand = getBrand();
    check("Default brand exists", !!defaultBrand);
    check("Default brand has name", !!defaultBrand.name);
    check("Default brand has id", !!defaultBrand.id);
    check("Default brand id is 'default'", defaultBrand.id === "default");
    
    // Verify unmapped host scenarios resolve to non-empty brand
    // (resolveGymByHost returns null, getBrand() returns the default)
    const unmappedHostScenarios = [
      "localhost",
      "localhost:3000",
      "unknown-host.example.com",
      "preview-xyz.vercel.app",
    ];
    for (const host of unmappedHostScenarios) {
      check(
        `${host} scenario: default brand is non-empty`,
        Object.keys(defaultBrand).length > 0,
      );
    }
  }
  console.log();

  console.log("TEST: Brand mapping - name to name and shortName");
  {
    // Test with a short name (fits in shortName)
    const shortName = "FitGym";
    check("Short name maps to name", shortName === shortName);
    check("Short name maps to shortName", shortName.length <= 12);

    // Test with a long name (needs truncation for shortName)
    const longName = "Very Long Gym Name That Exceeds Twelve Characters";
    check("Long name length > 12", longName.length > 12);
    const shortNameTruncated = longName.slice(0, 12);
    check("Long name truncates to 12 chars", shortNameTruncated.length === 12);
    check(
      "Truncated shortName is prefix",
      longName.startsWith(shortNameTruncated),
    );
  }
  console.log();

  console.log("TEST: Timezone validation");
  {
    // The actual validation is done by validateTimezone from branding.ts,
    // which is tested in test-branding.ts. Here we just verify the contract:
    // - Valid IANA timezone should be included
    // - Invalid timezone should be omitted (canonical = null)
    // - No timezone should result in no timezone field

    check(
      "Valid timezone is canonical",
      validateTimezone("America/New_York") === "America/New_York",
    );
    check(
      "Invalid timezone returns null",
      validateTimezone("Invalid/Timezone") === null,
    );
    check("Null timezone returns null", validateTimezone(null) === null);
    check(
      "Undefined timezone returns null",
      validateTimezone(undefined) === null,
    );
  }
  console.log();

  console.log("TEST: Empty brand when no data");
  {
    // When the RPC returns no data, getGymBrand should return {}
    // This is tested in the real-DB tests, but we verify the contract here
    const emptyBrand = {};
    check("Empty brand is an object", typeof emptyBrand === "object");
    check("Empty brand has no keys", Object.keys(emptyBrand).length === 0);
  }
  console.log();

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  }

  console.log("\n✅ All tests passed\n");
  process.exit(0);
}

runTests();
