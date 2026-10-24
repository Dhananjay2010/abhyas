#!/usr/bin/env tsx
/**
 * Test suite for Today screen missed-day detection.
 *
 * Tests the guards and logic that determine whether yesterday was "missed":
 * 1. started_on guard: dates before program start are never missed
 * 2. onboarding guard: dates before onboarding completion are never missed
 * 3. timezone: onboarding timestamp converted to user's local date
 * 4. Rest/Yoga/Breathing choices settle a day (planned/in_progress/completed/skipped)
 * 5. Real template data from the generator
 *
 * Each guard is proven: the test must fail when that guard is removed.
 */

import { isMissedTrainingDay } from "../src/lib/today/missed-day";
import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

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

// Real 3-day template (Mon/Wed/Fri)
const TEMPLATE_3DAY: Record<number, DayType> = {
  1: "weights", // Mon
  2: "rest",
  3: "weights", // Wed
  4: "rest",
  5: "weights", // Fri
  6: "rest",
  7: "rest",
};

// Real 4-day template (Mon/Tue/Thu/Fri)
const TEMPLATE_4DAY: Record<number, DayType> = {
  1: "weights", // Mon
  2: "weights", // Tue
  3: "rest",
  4: "weights", // Thu
  5: "weights", // Fri
  6: "rest",
  7: "rest",
};

function isoWeekday(date: string): number {
  const d = new Date(date + "T00:00:00Z");
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

console.log("=== Guard Test 1: started_on alone ===\n");

// Program started 2026-10-20 (Mon), NO onboarding date
// Check 2026-10-17 (Fri, before program start)
// Template: 3-day plan, Fri is training day
// Expected: NOT missed (before program start)
// This test MUST FAIL if the started_on check is removed
assert(
  !isMissedTrainingDay({
    date: "2026-10-17",
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-17")],
    sessions: [],
  }),
  "started_on guard: Date before program start (no onboarding) should NOT be missed"
);

console.log("\n=== Guard Test 2: onboarding alone ===\n");

// Program started 2026-10-10 (Thu), onboarding completed 2026-10-20 (Mon, 10 days later)
// Check 2026-10-17 (Fri, after program start but before onboarding)
// Template: 3-day plan, Fri is training day
// Expected: NOT missed (before onboarding completion)
// This test MUST FAIL if the onboarding check is removed
assert(
  !isMissedTrainingDay({
    date: "2026-10-17",
    programStartedOn: "2026-10-10",
    onboardingCompletedAt: "2026-10-20T12:00:00Z",
    timezone: "UTC",
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-17")],
    sessions: [],
  }),
  "onboarding guard: Date after program start but before onboarding should NOT be missed"
);

console.log("\n=== Guard Test 3: timezone conversion ===\n");

// onboardingCompletedAt: 2026-10-23T19:00:00Z (00:30 IST on 2026-10-24)
// programStartedOn: 2026-10-20 (Mon)
// date: 2026-10-23 (Fri)
// timezone: Asia/Kolkata (UTC+5:30)
// Template: 3-day plan, Fri is training day
// Expected: NOT missed (2026-10-23 < 2026-10-24 onboarding completion local date)
// This test MUST FAIL with UTC .slice(0,10) comparison
assert(
  !isMissedTrainingDay({
    date: "2026-10-23",
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: "2026-10-23T19:00:00Z",
    timezone: "Asia/Kolkata",
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-23")],
    sessions: [],
  }),
  "timezone guard: UTC timestamp after local midnight should NOT be missed when date is before local onboarding date"
);

console.log("\n=== Test 4: Real templates (3-day plan) ===\n");

// 3-day plan: Mon/Wed/Fri are training days, all others are rest
const programStart = "2026-10-20"; // Mon

for (let offset = 0; offset < 7; offset++) {
  const date = addDays(programStart, offset);
  const weekdayIndex = isoWeekday(date);
  const templateDayType = TEMPLATE_3DAY[weekdayIndex];
  const isTraining = templateDayType === "weights" || templateDayType === "bodyweight";
  
  const missed = isMissedTrainingDay({
    date,
    programStartedOn: programStart,
    onboardingCompletedAt: null,
    timezone: "UTC",
    templateDayType,
    sessions: [],
  });
  
  const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdayIndex - 1];
  if (weekdayIndex === 7) {
    // Special case: Sunday wraps to 7
    assert(
      !missed,
      `3-day ${dayName} (rest day): should NOT be missed`
    );
  } else if (isTraining) {
    assert(
      missed,
      `3-day ${dayName} (training day with no session): should be missed`
    );
  } else {
    assert(
      !missed,
      `3-day ${dayName} (rest day): should NOT be missed`
    );
  }
}

console.log("\n=== Test 5: Real templates (4-day plan) ===\n");

// 4-day plan: Mon/Tue/Thu/Fri are training days
for (let offset = 0; offset < 7; offset++) {
  const date = addDays(programStart, offset);
  const weekdayIndex = isoWeekday(date);
  const templateDayType = TEMPLATE_4DAY[weekdayIndex];
  const isTraining = templateDayType === "weights" || templateDayType === "bodyweight";
  
  const missed = isMissedTrainingDay({
    date,
    programStartedOn: programStart,
    onboardingCompletedAt: null,
    timezone: "UTC",
    templateDayType,
    sessions: [],
  });
  
  const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdayIndex - 1];
  if (weekdayIndex === 7) {
    assert(
      !missed,
      `4-day ${dayName} (rest day): should NOT be missed`
    );
  } else if (isTraining) {
    assert(
      missed,
      `4-day ${dayName} (training day with no session): should be missed`
    );
  } else {
    assert(
      !missed,
      `4-day ${dayName} (rest day): should NOT be missed`
    );
  }
}

console.log("\n=== Test 6: Completed strength session settles the day ===\n");

assert(
  !isMissedTrainingDay({
    date: "2026-10-21", // Mon (training day in 3-day plan)
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    templateDayType: "weights",
    sessions: [{ actual_type: "weights", status: "completed" }],
  }),
  "Completed strength session: should NOT be missed"
);

console.log("\n=== Test 7: Rest choice settles the day (planned) ===\n");

assert(
  !isMissedTrainingDay({
    date: "2026-10-21", // Mon (training day in 3-day plan)
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    templateDayType: "weights",
    sessions: [{ actual_type: "rest", status: "planned" }],
  }),
  "Planned Rest choice: should NOT be missed"
);

console.log("\n=== Test 8: Yoga choice settles the day (in_progress) ===\n");

assert(
  !isMissedTrainingDay({
    date: "2026-10-21", // Mon (training day in 3-day plan)
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    templateDayType: "weights",
    sessions: [{ actual_type: "yoga", status: "in_progress" }],
  }),
  "In-progress Yoga choice: should NOT be missed"
);

console.log("\n=== Test 9: Breathing choice settles the day (completed) ===\n");

assert(
  !isMissedTrainingDay({
    date: "2026-10-21", // Mon (training day in 3-day plan)
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    templateDayType: "weights",
    sessions: [{ actual_type: "meditation", status: "completed" }],
  }),
  "Completed Breathing choice: should NOT be missed"
);

console.log("\n=== Test 10: Rest choice settles the day (skipped) ===\n");

assert(
  !isMissedTrainingDay({
    date: "2026-10-21", // Mon (training day in 3-day plan)
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    templateDayType: "weights",
    sessions: [{ actual_type: "rest", status: "skipped" }],
  }),
  "Skipped Rest choice: should NOT be missed"
);

console.log("\n=== Test 11: Yoga day is never missed ===\n");

assert(
  !isMissedTrainingDay({
    date: "2026-10-21",
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    templateDayType: "yoga",
    sessions: [],
  }),
  "Yoga day with no session: should NOT be missed (anytime activity)"
);

console.log("\n=== Test 12: Breathing day is never missed ===\n");

assert(
  !isMissedTrainingDay({
    date: "2026-10-21",
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    templateDayType: "meditation",
    sessions: [],
  }),
  "Breathing day with no session: should NOT be missed (anytime activity)"
);

console.log("\n=== Test 13: Day 1 scenarios (various signup days) ===\n");

// Signup on Sunday, program starts Monday
assert(
  !isMissedTrainingDay({
    date: "2026-10-19", // Sun (before program start)
    programStartedOn: "2026-10-20", // Mon
    onboardingCompletedAt: "2026-10-19T20:00:00Z",
    timezone: "UTC",
    templateDayType: "rest",
    sessions: [],
  }),
  "Day before program start: should NOT be missed"
);

// Signup on Monday (day 1 of 3-day plan), checking if yesterday (Sun) was missed
assert(
  !isMissedTrainingDay({
    date: "2026-10-19", // Sun (yesterday, before program start Mon)
    programStartedOn: "2026-10-20", // Mon
    onboardingCompletedAt: "2026-10-20T08:00:00Z",
    timezone: "UTC",
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-19")], // Sun = 7, rest day
    sessions: [],
  }),
  "Day 1 yesterday check (Sun before Mon start): should NOT be missed"
);

// Saturday signup (program starts Saturday), yesterday Friday is training day in 3-day plan
// This is the prod bug: fresh Saturday signup shows 'missed yesterday' even though yesterday was before signup
assert(
  !isMissedTrainingDay({
    date: "2026-10-24", // Fri (yesterday, before program start Sat)
    programStartedOn: "2026-10-25", // Sat
    onboardingCompletedAt: "2026-10-25T10:00:00Z", // Sat morning
    timezone: "UTC",
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-24")], // Fri = 5, training day
    sessions: [],
  }),
  "Saturday signup: yesterday (Fri training day) should NOT be missed (before signup)"
);

console.log("\n=== Test 14: Day 1 comprehensive - signup today, program starts today ===\n");

// User signs up Monday, program starts Monday, checking yesterday (Sunday)
// Sunday is a rest day in 3-day plan
assert(
  !isMissedTrainingDay({
    date: "2026-10-19", // Sun (yesterday)
    programStartedOn: "2026-10-20", // Mon (today, signup day)
    onboardingCompletedAt: "2026-10-20T10:00:00Z", // Mon morning (today)
    timezone: "UTC",
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-19")], // Sun = 7, rest day
    sessions: [],
  }),
  "Signup today (Mon): yesterday (Sun) should NOT be missed (rest day, but also before signup)"
);

// User signs up Tuesday, program starts Tuesday, checking yesterday (Monday - training day)
assert(
  !isMissedTrainingDay({
    date: "2026-10-20", // Mon (yesterday, training day)
    programStartedOn: "2026-10-21", // Tue (today, signup day)
    onboardingCompletedAt: "2026-10-21T10:00:00Z", // Tue morning (today)
    timezone: "UTC",
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-20")], // Mon = 1, training day
    sessions: [],
  }),
  "Signup today (Tue): yesterday (Mon training day) should NOT be missed (before signup)"
);

console.log("\n=== Test 15: Day 1 comprehensive - signup yesterday, program starts today ===\n");

// User signed up yesterday (Sun), program starts today (Mon), checking yesterday (Sun)
// This simulates: user completed onboarding yesterday evening, today is day 1
assert(
  !isMissedTrainingDay({
    date: "2026-10-19", // Sun (yesterday, when user signed up)
    programStartedOn: "2026-10-20", // Mon (today, program starts)
    onboardingCompletedAt: "2026-10-19T20:00:00Z", // Sun evening (yesterday)
    timezone: "UTC",
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-19")], // Sun = 7, rest day
    sessions: [],
  }),
  "Signup yesterday (Sun), program starts today (Mon): yesterday should NOT be missed (before program start)"
);

// User signed up yesterday (Mon), program starts today (Tue), checking yesterday (Mon - training day)
assert(
  !isMissedTrainingDay({
    date: "2026-10-20", // Mon (yesterday, training day, when user signed up)
    programStartedOn: "2026-10-21", // Tue (today, program starts)
    onboardingCompletedAt: "2026-10-20T20:00:00Z", // Mon evening (yesterday)
    timezone: "UTC",
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-20")], // Mon = 1, training day
    sessions: [],
  }),
  "Signup yesterday (Mon training day), program starts today (Tue): yesterday should NOT be missed (before program start)"
);

console.log("\n=== Test 16: Real-world Saturday signup (ISO Kolkata, Monday-aligned program) ===\n");

// QA bug reproduction: Saturday 2026-10-25 signup in Asia/Kolkata
// If program.started_on is set to Monday 2026-10-20 (week-aligned),
// and onboarding_completed_at is Saturday 2026-10-25,
// yesterday (Friday 2026-10-24) should NOT be missed.
//
// This test uses the actual shapes createBlockForUser writes:
// - program.started_on might be aligned to Monday (hypothetical bug)
// - profile.onboarding_completed_at is the UTC timestamp of signup
assert(
  !isMissedTrainingDay({
    date: "2026-10-24", // Friday (yesterday)
    programStartedOn: "2026-10-20", // Monday (week-aligned, 5 days before signup)
    onboardingCompletedAt: "2026-10-25T04:30:00Z", // Saturday 10:00 AM IST
    timezone: "Asia/Kolkata",
    templateDayType: "weights", // 3-day plan, Friday is training
    sessions: [],
  }),
  "Saturday signup (Kolkata): Friday before signup should NOT be missed (even with Monday-aligned program)"
);

// Day 2: Sunday 2026-10-26 checking Saturday 2026-10-25
assert(
  !isMissedTrainingDay({
    date: "2026-10-25", // Saturday (yesterday, signup day)
    programStartedOn: "2026-10-20", // Monday
    onboardingCompletedAt: "2026-10-25T04:30:00Z", // Saturday 10:00 AM IST
    timezone: "Asia/Kolkata",
    templateDayType: "rest", // 3-day plan, Saturday is rest
    sessions: [],
  }),
  "Day 2 after Saturday signup: Saturday (signup day) should NOT be missed (rest day anyway)"
);

console.log("\n==================================================");
console.log(`📊 Test Results: ${passedTests}/${totalTests} passed`);

if (passedTests === totalTests) {
  console.log("✅ All tests passed!");
  process.exit(0);
} else {
  console.log(`❌ ${totalTests - passedTests} test(s) failed`);
  process.exit(1);
}
