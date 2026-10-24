#!/usr/bin/env tsx
/**
 * Test suite for Today screen missed-day detection.
 *
 * Tests the guards and logic that determine whether yesterday was "missed":
 * 1. started_on guard: dates before or on program start are never missed (signup day itself)
 * 2. onboarding guard: dates before onboarding completion are never missed
 * 3. timezone: onboarding timestamp converted to user's local date
 * 4. Rest/Yoga/Breathing choices settle a day (planned/in_progress/completed/skipped)
 * 5. Real template data from the generator
 * 6. Only choices for THIS program settle missed days
 * 7. Signup day itself never counts as missed
 */

import { isMissedTrainingDay } from "../src/lib/today/missed-day";
import { isoWeekday } from "../src/lib/dates";
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
  2: "rest",    // Tue
  3: "weights", // Wed
  4: "rest",    // Thu
  5: "weights", // Fri
  6: "rest",    // Sat
  7: "rest",    // Sun
};

// Real 4-day template (Mon/Tue/Thu/Fri)
const TEMPLATE_4DAY: Record<number, DayType> = {
  1: "weights", // Mon
  2: "weights", // Tue
  3: "rest",    // Wed
  4: "weights", // Thu
  5: "weights", // Fri
  6: "rest",    // Sat
  7: "rest",    // Sun
};

const TEST_PROGRAM_ID = "test-program-id";

console.log("=== Guard Test 1: started_on alone ===\n");

// Program started 2026-10-20 (Mon), NO onboarding date
// Check 2026-10-17 (Fri, before program start)
// Template: 3-day plan, Fri is training day
assert(
  !isMissedTrainingDay({
    date: "2026-10-17",
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-17")],
    sessions: [],
  }),
  "started_on guard: Date before program start (no onboarding) should NOT be missed"
);

console.log("\n=== Guard Test 2: onboarding alone ===\n");

// Program started 2026-10-10 (Thu), onboarding completed 2026-10-20 (Mon, 10 days later)
// Check 2026-10-17 (Fri, after program start but before onboarding)
assert(
  !isMissedTrainingDay({
    date: "2026-10-17",
    programStartedOn: "2026-10-10",
    onboardingCompletedAt: "2026-10-20T12:00:00Z",
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-17")],
    sessions: [],
  }),
  "onboarding guard: Date after program start but before onboarding should NOT be missed"
);

console.log("\n=== Guard Test 3: timezone conversion ===\n");

// onboardingCompletedAt: 2026-10-23T19:00:00Z (00:30 IST on 2026-10-24)
// Check: 2026-10-23 (Fri, before onboarding local date)
assert(
  !isMissedTrainingDay({
    date: "2026-10-23",
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: "2026-10-23T19:00:00Z",
    timezone: "Asia/Kolkata",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-23")],
    sessions: [],
  }),
  "timezone guard: UTC timestamp after local midnight should NOT be missed when date is before local onboarding date"
);

console.log("\n=== Test 4: Only THIS program's choices settle ===\n");

// Training day with anytime breathing (program_id null) should still be missed
// Use 2026-10-22 (Thu, weekday 4 in 4-day template = weights)
assert(
  isMissedTrainingDay({
    date: "2026-10-22", // Thu (training day, 2 days after signup)
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [{ actual_type: "meditation", status: "completed", program_id: null }],
  }),
  "Anytime breathing (program_id null) does NOT settle a missed strength day"
);

// Training day with planned Rest for THIS program should NOT be missed
assert(
  !isMissedTrainingDay({
    date: "2026-10-22", // Thu (training day, 2 days after signup)
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [{ actual_type: "rest", status: "planned", program_id: TEST_PROGRAM_ID }],
  }),
  "Planned Rest for this program settles the day (not missed)"
);

console.log("\n=== Test 5: Skipped/planned weights still count as missed ===\n");

// Training day with skipped weights session should still be missed
assert(
  isMissedTrainingDay({
    date: "2026-10-22", // Thu (training day, 2 days after signup)
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [{ actual_type: "weights", status: "skipped", program_id: TEST_PROGRAM_ID }],
  }),
  "Skipped weights session: still counts as missed (not completed)"
);

// Training day with planned weights session (never started) should still be missed
assert(
  isMissedTrainingDay({
    date: "2026-10-22", // Thu (training day, 2 days after signup)
    programStartedOn: "2026-10-20",
    onboardingCompletedAt: null,
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [{ actual_type: "weights", status: "planned", program_id: TEST_PROGRAM_ID }],
  }),
  "Planned weights session (never started): still counts as missed"
);

console.log("\n=== Test 6: Signup day never counts as missed ===\n");

// Day 2: checking if signup day (yesterday) was missed
// program.started_on is 2026-10-24 (Sat), onboarding completed same day
// Check 2026-10-24 (Sat, the signup day itself)
assert(
  !isMissedTrainingDay({
    date: "2026-10-24", // Sat (signup day)
    programStartedOn: "2026-10-24",
    onboardingCompletedAt: "2026-10-24T10:00:00Z",
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "rest", // Sat is rest in 3-day plan
    sessions: [],
  }),
  "Signup day (2026-10-24): should NOT be missed (date <= started_on)"
);

// Day 2 with training day template
assert(
  !isMissedTrainingDay({
    date: "2026-10-21", // Tue (signup day, training in 4-day plan)
    programStartedOn: "2026-10-21",
    onboardingCompletedAt: "2026-10-21T10:00:00Z",
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_4DAY[isoWeekday("2026-10-21")], // Tue = weights
    sessions: [],
  }),
  "Signup day (Tue, training day): should NOT be missed even if training weekday"
);

console.log("\n=== Test 7: Real-world Saturday signup (started_on is signup date) ===\n");

// Saturday 2026-10-25 signup, program.started_on = 2026-10-25 (the signup date)
// Day 1: Check Friday 2026-10-24 (yesterday)
assert(
  !isMissedTrainingDay({
    date: "2026-10-24", // Fri (yesterday, training day)
    programStartedOn: "2026-10-25", // Sat (signup date, program starts)
    onboardingCompletedAt: "2026-10-25T04:30:00Z", // Sat 10:00 AM IST
    timezone: "Asia/Kolkata",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights", // 3-day plan, Fri is training
    sessions: [],
  }),
  "Saturday signup: Friday before signup should NOT be missed"
);

console.log("\n=== Test 8: Rebuilt block (new started_on) ===\n");

// User rebuilt their block on 2026-10-22 (Wed)
// Old block was 2026-10-01 to 2026-10-21, new block starts 2026-10-22
// Check 2026-10-20 (Mon, training day in OLD block but before NEW block)
assert(
  !isMissedTrainingDay({
    date: "2026-10-20", // Mon (2 days before new block started)
    programStartedOn: "2026-10-22", // Wed (new block start, rebuild date)
    onboardingCompletedAt: "2026-10-01T10:00:00Z", // Original signup
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights", // Mon is training in 3-day plan
    sessions: [],
  }),
  "Rebuilt block: dates before new block's started_on are NOT missed"
);

// Check day after rebuild is correctly evaluated
assert(
  isMissedTrainingDay({
    date: "2026-10-23", // Thu (day after new block started)
    programStartedOn: "2026-10-22", // Wed (new block start)
    onboardingCompletedAt: "2026-10-01T10:00:00Z",
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights", // Thu is training in 4-day plan
    sessions: [],
  }),
  "Rebuilt block: training day after new block's started_on CAN be missed"
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
