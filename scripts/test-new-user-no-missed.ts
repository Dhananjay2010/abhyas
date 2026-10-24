#!/usr/bin/env tsx
/**
 * Test: Brand-new user should not see "missed yesterday"
 *
 * QA bug from main: a brand-new user's first Today page incorrectly shows
 * "You missed yesterday · Pull did not happen" even though they just signed up.
 *
 * The fix: isMissedTrainingDay guards against dates before max(profile.created_at, program.started_on).
 *
 * Test cases:
 * 1. User onboarded today on a 6-day plan, yesterday is a training day, no sessions → no "missed"
 * 2. Existing user with sessions on old program, but new program started_on=today → no "missed"
 */

import { isMissedTrainingDay } from "../src/lib/today/missed-day";

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    passedTests++;
    console.log(`✓ ${message}`);
  }
}

console.log("\n=== Test 1: Brand-new user onboarded today, yesterday is training day ===\n");

// Scenario: User signed up today (Oct 24), program started today
// Yesterday (Oct 23) was Wednesday (training day in their 6-day plan)
// No sessions exist yet
// Expected: NOT missed (they can't have missed anything before signup)

const today = "2026-10-24"; // Friday
const yesterday = "2026-10-23"; // Thursday
const profileCreatedAt = "2026-10-24T10:00:00Z"; // Signed up today at 10am UTC
const programStartedOn = today; // Program started today

const result1 = isMissedTrainingDay({
  date: yesterday,
  programStartedOn: programStartedOn,
  profileCreatedAt: profileCreatedAt,
  timezone: "UTC",
  templateDayType: "weights", // Yesterday was a training day in template
  programId: "program-1",
  sessions: [], // No sessions yet (brand new user)
  hasStartedAny: false, // Brand new user, never started
});

assert(
  !result1,
  "Brand-new user: yesterday before signup/program-start is NOT missed"
);

console.log("\n=== Test 2: Brand-new user with signup before program start ===\n");

// Scenario: User signed up yesterday (Oct 23), program started today (Oct 24)
// Day before yesterday (Oct 22) was a training day
// Expected: NOT missed (day before program started)

const dayBeforeYesterday = "2026-10-22"; // Wednesday
const signupYesterday = "2026-10-23T15:00:00Z"; // Signed up yesterday

const result2 = isMissedTrainingDay({
  date: dayBeforeYesterday,
  programStartedOn: today, // Program started today
  profileCreatedAt: signupYesterday, // Signed up yesterday
  timezone: "UTC",
  templateDayType: "weights", // Day before yesterday was training day
  programId: "program-1",
  sessions: [],
  hasStartedAny: false,
});

assert(
  !result2,
  "Day before program started is NOT missed (even if after signup)"
);

console.log("\n=== Test 3: Existing user with new program started today ===\n");

// Scenario: User has completed sessions on an old program
// But their new program started today (Oct 24)
// Yesterday (Oct 23) was a training day in the NEW program's template
// Expected: NOT missed (yesterday was before new program started)

const result3 = isMissedTrainingDay({
  date: yesterday,
  programStartedOn: today, // New program started today
  profileCreatedAt: "2026-10-01T10:00:00Z", // Signed up 3 weeks ago
  timezone: "UTC",
  templateDayType: "weights", // Yesterday was training day in new program
  programId: "new-program-id",
  sessions: [], // No sessions in new program yet
  hasStartedAny: true, // User has started sessions before (on old program)
});

assert(
  !result3,
  "Existing user: yesterday before new program start is NOT missed"
);

console.log("\n=== Test 4: Existing user with old sessions, yesterday after new program start ===\n");

// Scenario: Existing user, new program started 2 days ago
// Yesterday was a training day, no session completed
// Expected: MISSED (yesterday was after program started, user has started before)

const twoDaysAgo = "2026-10-22"; // Wed

const result4 = isMissedTrainingDay({
  date: yesterday,
  programStartedOn: twoDaysAgo, // Program started 2 days ago
  profileCreatedAt: "2026-10-01T10:00:00Z", // Signed up 3 weeks ago
  timezone: "UTC",
  templateDayType: "weights", // Yesterday was training day
  programId: "new-program-id",
  sessions: [], // No sessions in new program for yesterday
  hasStartedAny: true, // User has started sessions before
});

assert(
  result4,
  "Existing user: yesterday after program start IS missed"
);

console.log("\n=== Test 5: Program template started before user signup ===\n");

// Scenario: Program template started 3 days ago (Oct 21)
// User signed up today (Oct 24)
// Yesterday (Oct 23) was a training day
// Expected: NOT missed (yesterday before user signup, even though after template start)

const threeDaysAgo = "2026-10-21"; // Mon

const result5 = isMissedTrainingDay({
  date: yesterday,
  programStartedOn: threeDaysAgo, // Template started 3 days ago
  profileCreatedAt: profileCreatedAt, // Signed up today
  timezone: "UTC",
  templateDayType: "weights",
  programId: "program-1",
  sessions: [],
  hasStartedAny: false,
});

assert(
  !result5,
  "Yesterday before signup is NOT missed (even if after template start)"
);

console.log("\n=== Test 6: Timezone edge case - signup late in day ===\n");

// Scenario: User in Asia/Tokyo (UTC+9) signed up Oct 24 at 11pm local time
// That's Oct 24 14:00 UTC
// Yesterday local (Oct 23) should not be missed

const tokyoSignup = "2026-10-24T14:00:00Z"; // Oct 24 11pm in Tokyo

const result6 = isMissedTrainingDay({
  date: "2026-10-23", // Yesterday local in Tokyo
  programStartedOn: "2026-10-24", // Program started Oct 24 (today local)
  profileCreatedAt: tokyoSignup,
  timezone: "Asia/Tokyo",
  templateDayType: "weights",
  programId: "program-1",
  sessions: [],
  hasStartedAny: false,
});

assert(
  !result6,
  "Timezone: yesterday local before signup local is NOT missed"
);

console.log(`\n✅ All ${passedTests}/${totalTests} new user tests passed!\n`);
