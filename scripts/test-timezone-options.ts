#!/usr/bin/env tsx
/**
 * F1 test: Timezone options builder with canonical aliases.
 * 
 * Tests that buildTimezoneOptions:
 * - Includes canonical aliases (Asia/Kolkata, Europe/Kyiv, UTC, etc.)
 * - Always includes the stored timezone
 * - Returns deduped and sorted list
 */

import { buildTimezoneOptions } from "../src/lib/timezone-options";

(function() {
let failures = 0;

function testTimezoneOptions(
  description: string,
  storedTimezone: string | null,
  checks: {
    includesAll?: string[];
    sorted?: boolean;
    noDuplicates?: boolean;
  }
) {
  const result = buildTimezoneOptions(storedTimezone);
  
  // Check all required timezones are included
  if (checks.includesAll) {
    for (const tz of checks.includesAll) {
      if (!result.includes(tz)) {
        console.error(`❌ ${description} - missing timezone: ${tz}`);
        failures++;
        return;
      }
    }
  }
  
  // Check sorted
  if (checks.sorted) {
    const sorted = [...result].sort();
    const matches = result.every((tz, i) => tz === sorted[i]);
    if (!matches) {
      console.error(`❌ ${description} - list not sorted`);
      failures++;
      return;
    }
  }
  
  // Check no duplicates
  if (checks.noDuplicates) {
    const unique = new Set(result);
    if (unique.size !== result.length) {
      console.error(`❌ ${description} - list has duplicates`);
      failures++;
      return;
    }
  }
  
  console.log(`✓ ${description}`);
}

console.log("Testing timezone options builder (F1)...\n");

// Test canonical aliases are included
testTimezoneOptions(
  "Includes Asia/Kolkata",
  null,
  { includesAll: ["Asia/Kolkata"] }
);

testTimezoneOptions(
  "Includes Europe/Kyiv",
  null,
  { includesAll: ["Europe/Kyiv"] }
);

testTimezoneOptions(
  "Includes UTC",
  null,
  { includesAll: ["UTC"] }
);

testTimezoneOptions(
  "Includes America/Argentina/Buenos_Aires",
  null,
  { includesAll: ["America/Argentina/Buenos_Aires"] }
);

testTimezoneOptions(
  "Includes Asia/Ho_Chi_Minh",
  null,
  { includesAll: ["Asia/Ho_Chi_Minh"] }
);

testTimezoneOptions(
  "Includes Asia/Kathmandu",
  null,
  { includesAll: ["Asia/Kathmandu"] }
);

testTimezoneOptions(
  "Includes Asia/Yangon",
  null,
  { includesAll: ["Asia/Yangon"] }
);

// Test multiple canonical aliases together
testTimezoneOptions(
  "Includes all canonical aliases",
  null,
  {
    includesAll: [
      "Asia/Kolkata",
      "Europe/Kyiv",
      "UTC",
      "America/Argentina/Buenos_Aires",
      "Asia/Ho_Chi_Minh",
      "Asia/Kathmandu",
      "Asia/Yangon",
    ]
  }
);

// Test stored timezone is included
testTimezoneOptions(
  "Includes stored timezone when provided",
  "America/New_York",
  { includesAll: ["America/New_York"] }
);

testTimezoneOptions(
  "Includes stored timezone even if not in Intl or aliases",
  "Custom/Zone",
  { includesAll: ["Custom/Zone"] }
);

// Test list properties
testTimezoneOptions(
  "List is sorted",
  null,
  { sorted: true }
);

testTimezoneOptions(
  "List has no duplicates",
  null,
  { noDuplicates: true }
);

testTimezoneOptions(
  "List is sorted with stored timezone",
  "America/New_York",
  { sorted: true, noDuplicates: true }
);

// Test that it works with Asia/Kolkata stored (the prod case)
testTimezoneOptions(
  "Works with Asia/Kolkata stored (prod case)",
  "Asia/Kolkata",
  {
    includesAll: ["Asia/Kolkata"],
    sorted: true,
    noDuplicates: true,
  }
);

// Test alias deduplication
function testAliasDeduplication() {
  const result = buildTimezoneOptions(null);
  
  // Check that legacy aliases are NOT in the list
  const legacyAliases = ["Asia/Calcutta", "Europe/Kiev"];
  const canonicalNames = ["Asia/Kolkata", "Europe/Kyiv"];
  
  for (let i = 0; i < legacyAliases.length; i++) {
    const legacy = legacyAliases[i];
    const canonical = canonicalNames[i];
    
    if (result.includes(legacy)) {
      console.error(`❌ Alias deduplication failed - ${legacy} should not be in list (only ${canonical})`);
      failures++;
      return;
    }
    
    if (!result.includes(canonical)) {
      console.error(`❌ Alias deduplication failed - ${canonical} should be in list`);
      failures++;
      return;
    }
  }
  
  console.log("✓ Legacy aliases are canonicalized (Asia/Calcutta → Asia/Kolkata, Europe/Kiev → Europe/Kyiv)");
}

testAliasDeduplication();

// Test that stored alias is canonicalized
testTimezoneOptions(
  "Stored alias Asia/Calcutta is canonicalized to Asia/Kolkata",
  "Asia/Calcutta",
  {
    includesAll: ["Asia/Kolkata"],
    noDuplicates: true,
  }
);

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
})();
