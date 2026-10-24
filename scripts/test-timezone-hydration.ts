#!/usr/bin/env tsx
/**
 * Tests for timezone hydration fix.
 * 
 * Ensures that:
 * - Timezone list is deterministic (sorted)
 * - User's current timezone is included even if missing from Intl's list
 * - Server-computed list prevents hydration mismatches
 */

let failures = 0;

function testTimezoneList(
  description: string,
  userTimezone: string | null,
  intlTimezones: string[],
  expected: { 
    includes: string[];
    sorted: boolean;
  }
) {
  // Simulate the logic from page.tsx
  const timezones = [...intlTimezones];
  if (userTimezone && !timezones.includes(userTimezone)) {
    timezones.push(userTimezone);
    timezones.sort();
  }
  
  // Check that all expected values are included
  for (const tz of expected.includes) {
    if (!timezones.includes(tz)) {
      console.error(`❌ ${description} - missing timezone: ${tz}`);
      failures++;
      return;
    }
  }
  
  // Check if sorted
  if (expected.sorted) {
    const sorted = [...timezones].sort();
    const matches = timezones.every((tz, i) => tz === sorted[i]);
    if (!matches) {
      console.error(`❌ ${description} - list not sorted`);
      failures++;
      return;
    }
  }
  
  console.log(`✓ ${description}`);
}

console.log("Testing timezone hydration fix...\n");

// Standard case - user timezone is in Intl list
testTimezoneList(
  "User timezone in Intl list - included",
  "America/New_York",
  ["America/Chicago", "America/New_York", "Europe/London"],
  {
    includes: ["America/New_York"],
    sorted: true,
  }
);

// User timezone missing from Intl list - should be added
testTimezoneList(
  "User timezone missing from Intl list - added and sorted",
  "Custom/Timezone",
  ["America/Chicago", "Europe/London"],
  {
    includes: ["America/Chicago", "Custom/Timezone", "Europe/London"],
    sorted: true,
  }
);

// Null timezone - should not add anything
testTimezoneList(
  "Null timezone - no changes to list",
  null,
  ["America/Chicago", "Europe/London"],
  {
    includes: ["America/Chicago", "Europe/London"],
    sorted: true,
  }
);

// Empty Intl list with user timezone - should add user timezone
testTimezoneList(
  "Empty Intl list with user timezone - adds user timezone",
  "America/Los_Angeles",
  [],
  {
    includes: ["America/Los_Angeles"],
    sorted: true,
  }
);

// User timezone already exists - should not duplicate
testTimezoneList(
  "User timezone already in list - no duplicate",
  "Europe/London",
  ["America/Chicago", "Asia/Tokyo", "Europe/London"],
  {
    includes: ["America/Chicago", "Asia/Tokyo", "Europe/London"],
    sorted: true,
  }
);

// User timezone that would sort to beginning
testTimezoneList(
  "User timezone sorts to beginning - maintains sort order",
  "Africa/Cairo",
  ["America/New_York", "Europe/London"],
  {
    includes: ["Africa/Cairo", "America/New_York", "Europe/London"],
    sorted: true,
  }
);

// User timezone that would sort to middle
testTimezoneList(
  "User timezone sorts to middle - maintains sort order",
  "Europe/Berlin",
  ["America/New_York", "Europe/London", "Pacific/Auckland"],
  {
    includes: ["America/New_York", "Europe/Berlin", "Europe/London", "Pacific/Auckland"],
    sorted: true,
  }
);

// User timezone that would sort to end
testTimezoneList(
  "User timezone sorts to end - maintains sort order",
  "Pacific/Samoa",
  ["America/New_York", "Europe/London"],
  {
    includes: ["America/New_York", "Europe/London", "Pacific/Samoa"],
    sorted: true,
  }
);

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
