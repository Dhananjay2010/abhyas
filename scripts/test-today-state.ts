#!/usr/bin/env tsx
/**
 * Comprehensive test suite for Today screen logic.
 *
 * Tests:
 * - Missed-day detection with guards (started_on, onboarding, program ID)
 * - Today answered detection (planned Rest/Yoga/Breathing, Keep, Swap)
 * - Prompt decision function (mutual exclusivity, no duplicate prompts)
 * - Next training day calculation for first-day rest day
 */

import { isMissedTrainingDay } from "../src/lib/today/missed-day";
import { decideTodayPrompt } from "../src/lib/today/prompt-state";
import { isTodayAnswered } from "../src/lib/today/answered";
import { nextTrainingDay } from "../src/lib/today/next-training-day";
import { isoWeekday } from "../src/lib/dates";
import type { Database } from "../src/lib/database.types";
import { buildTodayState } from "../src/lib/today/build-state";

type DayType = Database["public"]["Enums"]["day_type"];

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
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

console.log("=== Guard Test 1: Signup day - Saturday signup, Friday training day ===\n");

// 2026-10-24 is Sat (signup day), 2026-10-23 is Fri (training day in 3-day plan)
// User signs up Saturday, Friday was a training day but user wasn't signed up yet
assert(
  !isMissedTrainingDay({
    date: "2026-10-23", // Fri (yesterday, training day)
    programStartedOn: "2026-10-24", // Sat (signup day)
    profileCreatedAt: "2026-10-24T10:00:00Z", // Sat signup
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-23")], // Fri = weights
    sessions: [],
  hasStartedAny: true,
  }),
  "Signup Saturday 2026-10-24: yesterday Friday (training day) is NOT missed"
);

console.log("\n=== Guard Test 2: Block rebuilt today ===\n");

// Profile created 2026-10-10 (Sat), block rebuilt 2026-10-24 (Sat)
// Yesterday 2026-10-23 (Fri, training day) should NOT be missed
assert(
  !isMissedTrainingDay({
    date: "2026-10-23", // Fri (yesterday, training day)
    programStartedOn: "2026-10-24", // Sat (block rebuilt today)
    profileCreatedAt: "2026-10-10T10:00:00Z", // Sat (2 weeks earlier)
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-23")], // Fri = weights
    sessions: [],
  hasStartedAny: true,
  }),
  "Block rebuilt today (2026-10-24): yesterday (Fri) is NOT missed even though created_at earlier"
);

console.log("\n=== Guard Test 2b: Completed strength session with 0 working sets ===\n");

// A completed strength session with 0 working sets should NOT settle a missed training day
// This guards against skipped sessions (status='completed' but no sets logged)
assert(
  isMissedTrainingDay({
    date: "2026-10-23", // Fri (training day in 3-day plan)
    programStartedOn: "2026-10-20", // Tue (signup day)
    profileCreatedAt: "2026-10-20T10:00:00Z", // Tue signup
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-23")], // Fri = weights
    sessions: [
      {
        status: "completed",
        actual_type: "weights",
        program_id: TEST_PROGRAM_ID,
        working_set_count: 0, // 0 working sets = skipped session
      },
    ],
    hasStartedAny: true,
  }),
  "Completed strength session with 0 working sets does NOT settle missed day (still missed)"
);

// Verify that 1+ working sets DOES settle the day
assert(
  !isMissedTrainingDay({
    date: "2026-10-23", // Fri (training day in 3-day plan)
    programStartedOn: "2026-10-20", // Tue (signup day)
    profileCreatedAt: "2026-10-20T10:00:00Z", // Tue signup
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-23")], // Fri = weights
    sessions: [
      {
        status: "completed",
        actual_type: "weights",
        program_id: TEST_PROGRAM_ID,
        working_set_count: 1, // 1+ working sets = real workout
      },
    ],
    hasStartedAny: true,
  }),
  "Completed strength session with 1+ working sets DOES settle missed day (not missed)"
);

console.log("\n=== Guard Test 3: Day 3 after signup, never started (NEW BEHAVIOR) ===\n");

// Signup Tue 2026-10-20, today is Fri 2026-10-23 (day 4)
// Wed 2026-10-21 was a training day but user has never started ANY session
// NEW BEHAVIOR: Never-started users do NOT get missed prompts (day-one guard)
assert(
  !isMissedTrainingDay({
    date: "2026-10-21", // Wed (day 2, training day in 3-day plan)
    programStartedOn: "2026-10-20", // Tue (signup day)
    profileCreatedAt: "2026-10-20T10:00:00Z", // Tue signup
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-21")], // Wed = weights
    sessions: [],
    hasStartedAny: false,
  }),
  "Day 3 after signup, never started: day-one guard suppresses missed prompt"
);

console.log("\n=== Guard Test 4: Timezone conversion ===\n");

// 2026-10-23 is Fri (training day in 3-day plan)
// profileCreatedAt: 2026-10-23T19:00:00Z (00:30 IST on 2026-10-24 Sat)
// Local date is Sat 2026-10-24, so Fri 2026-10-23 is before signup
assert(
  !isMissedTrainingDay({
    date: "2026-10-23", // Fri (training day)
    programStartedOn: "2026-10-20", // Tue
    profileCreatedAt: "2026-10-23T19:00:00Z", // 00:30 IST on Oct 24 (Sat)
    timezone: "Asia/Kolkata",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-23")], // Fri = weights
    sessions: [],
  hasStartedAny: true,
  }),
  "Timezone: UTC timestamp after local midnight - Fri before local Sat signup is NOT missed"
);

console.log("\n=== Test 4: Only THIS program's choices settle ===\n");

// 2026-10-21 is Wed (training day in 3-day plan)
// Anytime breathing (program_id null) should NOT settle
assert(
  isMissedTrainingDay({
    date: "2026-10-21", // Wed (training day)
    programStartedOn: "2026-10-20", // Tue
    profileCreatedAt: null,
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [{ actual_type: "meditation", status: "completed", program_id: null }],
  hasStartedAny: true,
  }),
  "Anytime breathing (program_id null) does NOT settle a missed strength day"
);

// Planned Rest for THIS program should settle
assert(
  !isMissedTrainingDay({
    date: "2026-10-21", // Wed (training day)
    programStartedOn: "2026-10-20", // Tue
    profileCreatedAt: null,
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [{ actual_type: "rest", status: "planned", program_id: TEST_PROGRAM_ID }],
  hasStartedAny: true,
  }),
  "Planned Rest for this program settles the day (not missed)"
);

console.log("\n=== Test 5: Skipped/planned weights still count as missed ===\n");

// Skipped weights should still be missed
assert(
  isMissedTrainingDay({
    date: "2026-10-21", // Wed (training day)
    programStartedOn: "2026-10-20", // Tue
    profileCreatedAt: null,
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [{ actual_type: "weights", status: "skipped", program_id: TEST_PROGRAM_ID }],
  hasStartedAny: true,
  }),
  "Skipped weights session: still counts as missed"
);

// Planned weights (never started) should still be missed
assert(
  isMissedTrainingDay({
    date: "2026-10-21", // Wed (training day)
    programStartedOn: "2026-10-20", // Tue
    profileCreatedAt: null,
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [{ actual_type: "weights", status: "planned", program_id: TEST_PROGRAM_ID }],
  hasStartedAny: true,
  }),
  "Planned weights session (never started): still counts as missed"
);

console.log("\n=== Test 6: Signup day guard (date < earliestCountableDate) ===\n");

// Test with weights template on the signup day itself
// 2026-10-26 is Mon (training day in 3-day plan), program starts 2026-10-26
// REQUIREMENT (QA Bot 2): Signup day itself is NEVER missed (date <= earliestCountableDate returns false)
assert(
  !isMissedTrainingDay({
    date: "2026-10-26", // Mon (signup day, training day)
    programStartedOn: "2026-10-26", // Mon (same day)
    profileCreatedAt: "2026-10-26T10:00:00Z",
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-26")], // Mon = weights
    sessions: [],
    hasStartedAny: true,
  }),
  "Signup day with weights template: CANNOT be missed (signup day itself exempt)"
);

// Test that fails if the guard is removed
// 2026-10-25 is Sun (day before signup, rest day)
assert(
  !isMissedTrainingDay({
    date: "2026-10-25", // Sun (day before signup, rest day)
    programStartedOn: "2026-10-26", // Mon
    profileCreatedAt: "2026-10-26T10:00:00Z",
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "rest",
    sessions: [],
  hasStartedAny: true,
  }),
  "Day before signup: should NOT be missed (fails if date <= started_on guard removed)"
);

console.log("\n=== Test 6a: Defense-in-depth - plan started before signup ===\n");

// Program started Wed 2026-10-20, user signed up Sat 2026-10-23
// Fri 2026-10-22 was a training day in the template but before user signup
// Defense-in-depth: should NOT be missed (date < max(created_at local, started_on))
assert(
  !isMissedTrainingDay({
    date: "2026-10-22", // Fri (training day, 1 day before signup)
    programStartedOn: "2026-10-20", // Wed (program started 3 days before signup)
    profileCreatedAt: "2026-10-23T10:00:00Z", // Sat signup
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [],
    hasStartedAny: true,
  }),
  "Defense-in-depth: training day before signup is NOT missed (plan started 3 days before)"
);

console.log("\n=== NEW Test 6b: Signup day Saturday, yesterday Friday was training day ===\n");

// User signed up Saturday 2026-10-24 at 10:00 UTC
// Yesterday Friday 2026-10-23 was a training day in the template
// NEW REQUIREMENT: must NOT show "missed yesterday" on signup day
// earliestCountableDate = max(2026-10-24, 2026-10-24) = 2026-10-24
// date 2026-10-23 <= 2026-10-24 is FALSE, but we need date < earliestCountableDate logic
assert(
  !isMissedTrainingDay({
    date: "2026-10-23", // Fri (yesterday, training day)
    programStartedOn: "2026-10-24", // Sat (signup day = program start)
    profileCreatedAt: "2026-10-24T10:00:00Z", // Sat signup
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [],
    hasStartedAny: false, // Brand new user
  }),
  "NEW: Signup Saturday, yesterday Friday training day is NOT missed (brand new user on signup day)"
);

// With hasStartedAny=true, still should NOT be missed because date <= earliestCountableDate
assert(
  !isMissedTrainingDay({
    date: "2026-10-23", // Fri (yesterday, training day)
    programStartedOn: "2026-10-24", // Sat (signup day = program start)
    profileCreatedAt: "2026-10-24T10:00:00Z", // Sat signup
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [],
    hasStartedAny: true,
  }),
  "NEW: Signup Saturday, yesterday Friday is NOT missed even if hasStartedAny=true"
);

console.log("\n=== NEW Test 6c: Old account, block started today ===\n");

// Account created 2 weeks ago (2026-10-10), but block started today (2026-10-24)
// Yesterday (2026-10-23) was a training day
// NEW REQUIREMENT: must NOT show missed because block started today
// earliestCountableDate = max(2026-10-10, 2026-10-24) = 2026-10-24
assert(
  !isMissedTrainingDay({
    date: "2026-10-23", // Fri (yesterday, training day)
    programStartedOn: "2026-10-24", // Sat (block started today)
    profileCreatedAt: "2026-10-10T10:00:00Z", // Account 2 weeks old
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [],
    hasStartedAny: true,
  }),
  "NEW: Old account but block started today, yesterday NOT missed"
);

console.log("\n=== NEW Test 6d: Genuinely missed day after signup and block start ===\n");

// Signup/block start on Monday 2026-10-20
// Wednesday 2026-10-22 was a training day (2 days after signup)
// User has started at least one session
// This SHOULD be marked as missed
assert(
  isMissedTrainingDay({
    date: "2026-10-22", // Wed (2 days after signup, training day)
    programStartedOn: "2026-10-20", // Mon (signup day)
    profileCreatedAt: "2026-10-20T10:00:00Z", // Mon signup
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: "weights",
    sessions: [],
    hasStartedAny: true,
  }),
  "NEW: Training day 2 days after signup IS missed (genuine missed day)"
);

console.log("\n=== NEW Test 6e: Signup-day guard prevents false missed prompt ===\n");

// This test verifies the earliestCountableDate guard works correctly
// signup Saturday, yesterday Friday training day
const signupDayGuardTest = isMissedTrainingDay({
  date: "2026-10-23", // Fri (yesterday, before signup)
  programStartedOn: "2026-10-24", // Sat (signup day)
  profileCreatedAt: "2026-10-24T10:00:00Z", // Sat signup
  timezone: "UTC",
  programId: TEST_PROGRAM_ID,
  templateDayType: "weights",
  sessions: [],
  hasStartedAny: false,
});

assert(
  !signupDayGuardTest,
  "Guard test: Signup day prevents false missed prompt for yesterday"
);

console.log("\n=== Test 7: Rebuilt block (current block's started_on) ===\n");

// Rebuilt on 2026-10-21 (Wed), old block was 2026-10-01 to 2026-10-20
// Check 2026-10-20 (Tue, training day in 4-day plan but before NEW block)
assert(
  !isMissedTrainingDay({
    date: "2026-10-20", // Tue (before new block)
    programStartedOn: "2026-10-21", // Wed (new block start)
    profileCreatedAt: "2026-10-01T10:00:00Z",
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_4DAY[isoWeekday("2026-10-20")], // Tue = weights in 4-day
    sessions: [],
  hasStartedAny: true,
  }),
  "Rebuilt block: dates before new block's started_on are NOT missed"
);

// Day after rebuild CAN be missed
// 2026-10-23 is Fri (training day in 3-day plan, after new block started)
assert(
  isMissedTrainingDay({
    date: "2026-10-23", // Fri (after new block started)
    programStartedOn: "2026-10-21", // Wed (new block start)
    profileCreatedAt: "2026-10-01T10:00:00Z",
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-23")], // Fri = weights
    sessions: [],
  hasStartedAny: true,
  }),
  "Rebuilt block: training day after new block's started_on CAN be missed"
);

console.log("\n=== Test 8: isTodayAnswered helper ===\n");

// Planned Rest
assert(
  isTodayAnswered(
    [{ status: "planned", actual_type: "rest", program_id: TEST_PROGRAM_ID }],
    TEST_PROGRAM_ID
  ),
  "Planned Rest row answers today"
);

// Planned Yoga
assert(
  isTodayAnswered(
    [{ status: "planned", actual_type: "yoga", program_id: TEST_PROGRAM_ID }],
    TEST_PROGRAM_ID
  ),
  "Planned Yoga row answers today"
);

// Planned Breathing
assert(
  isTodayAnswered(
    [{ status: "planned", actual_type: "meditation", program_id: TEST_PROGRAM_ID }],
    TEST_PROGRAM_ID
  ),
  "Planned Breathing row answers today"
);

// Keep row (planned weights with scheduled day's type)
assert(
  isTodayAnswered(
    [{ status: "planned", actual_type: "weights", program_id: TEST_PROGRAM_ID }],
    TEST_PROGRAM_ID
  ),
  "Keep row (planned weights) answers today"
);

// Swap row (planned weights)
assert(
  isTodayAnswered(
    [{ status: "planned", actual_type: "weights", program_id: TEST_PROGRAM_ID }],
    TEST_PROGRAM_ID
  ),
  "Swap row (planned weights) answers today"
);

// Breathing with no program does NOT answer
assert(
  !isTodayAnswered(
    [{ status: "completed", actual_type: "meditation", program_id: null }],
    TEST_PROGRAM_ID
  ),
  "Breathing session with no program is NOT an answer"
);

// Row from different program does NOT answer
assert(
  !isTodayAnswered(
    [{ status: "planned", actual_type: "rest", program_id: "other-program" }],
    TEST_PROGRAM_ID
  ),
  "Row from different program is NOT an answer"
);

console.log("\n=== Test 9: Prompt decision (mutual exclusivity) ===\n");

// No prompts when session done
assert(
  decideTodayPrompt({
    missedYesterday: true,
    dayType: "rest",
    answeredToday: false,
    strengthDone: true,
    strengthOpen: false,
  }) === "none",
  "No prompt when session is done"
);

// No prompts when session open
assert(
  decideTodayPrompt({
    missedYesterday: true,
    dayType: "rest",
    answeredToday: false,
    strengthDone: false,
    strengthOpen: true,
  }) === "none",
  "No prompt when session is open"
);

// Rest day with missed yesterday shows both
assert(
  decideTodayPrompt({
    missedYesterday: true,
    dayType: "rest",
    answeredToday: false,
    strengthDone: false,
    strengthOpen: false,
  }) === "both",
  "Rest day with missed yesterday shows both prompts (rest content + missed prompt)"
);

// Missed yesterday (not rest day) shows missed
assert(
  decideTodayPrompt({
    missedYesterday: true,
    dayType: "weights",
    answeredToday: false,
    strengthDone: false,
    strengthOpen: false,
  }) === "missed",
  "Missed yesterday on training day shows missed prompt"
);

// Rest day (no missed) shows rest_plan
assert(
  decideTodayPrompt({
    missedYesterday: false,
    dayType: "rest",
    answeredToday: false,
    strengthDone: false,
    strengthOpen: false,
  }) === "rest_plan",
  "Rest day with no missed shows rest_plan"
);

// Answered today hides missed
assert(
  decideTodayPrompt({
    missedYesterday: true,
    dayType: "weights",
    answeredToday: true,
    strengthDone: false,
    strengthOpen: false,
  }) === "none",
  "Answered today hides missed prompt"
);

// Training day with no issues
assert(
  decideTodayPrompt({
    missedYesterday: false,
    dayType: "weights",
    answeredToday: false,
    strengthDone: false,
    strengthOpen: false,
  }) === "none",
  "Training day with no issues shows no prompt"
);

console.log("\n=== Test 10: Day-one guard (NEW BEHAVIOR) ===\n");

// NEW BEHAVIOR: User who never started does NOT see missed prompts (day-one guard)
// This is the friendlier onboarding experience - no nagging until first session starts.
// Signup Tue 10-20, check Fri 10-23 (day 4, training day in 3-day plan), no sessions.
assert(
  !isMissedTrainingDay({
    date: "2026-10-23", // Fri (training day, 3 days after Tue signup)
    programStartedOn: "2026-10-20", // Tue (signup day)
    profileCreatedAt: "2026-10-20T10:00:00Z",
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-23")], // Fri = weights
    sessions: [],
    hasStartedAny: false,
  }),
  "User who never started: day-one guard suppresses missed prompts"
);

// Once user HAS started at least one session, missed prompts work normally
assert(
  isMissedTrainingDay({
    date: "2026-10-23", // Fri (training day, 3 days after Tue signup)
    programStartedOn: "2026-10-20", // Tue (signup day)
    profileCreatedAt: "2026-10-20T10:00:00Z",
    timezone: "UTC",
    programId: TEST_PROGRAM_ID,
    templateDayType: TEMPLATE_3DAY[isoWeekday("2026-10-23")], // Fri = weights
    sessions: [],
    hasStartedAny: true,
  }),
  "User who HAS started before: missed prompt works normally"
);

// Bug (b): Rest day with missed yesterday loses rest content
// Verify that promptType "both" ensures rest content renders
const bothResult = decideTodayPrompt({
  missedYesterday: true,
  dayType: "rest",
  answeredToday: false,
  strengthDone: false,
  strengthOpen: false,
});
assert(
  bothResult === "both",
  "Rest day with missed yesterday returns 'both' (not 'none')"
);

console.log("\n=== Test 11: nextTrainingDay helper ===\n");

const days3 = Object.entries(TEMPLATE_3DAY).map(([idx, type]) => ({
  day_index: Number(idx),
  day_type: type,
  label: null,
}));

const days4 = Object.entries(TEMPLATE_4DAY).map(([idx, type]) => ({
  day_index: Number(idx),
  day_type: type,
  label: null,
}));

// Signup on Saturday 2026-10-24 → Monday 2026-10-26
const nextFromSatRest = nextTrainingDay(days3, "2026-10-24");
assert(
  nextFromSatRest?.dayName === "Monday" && nextFromSatRest?.dayIndex === 1,
  "Signup on Saturday 2026-10-24 (Sat) gives Monday"
);

// Signup on Sunday 2026-10-25 → Monday 2026-10-26
const nextFromSun = nextTrainingDay(days3, "2026-10-25");
assert(
  nextFromSun?.dayName === "Monday" && nextFromSun?.dayIndex === 1,
  "Signup on Sunday 2026-10-25 (Sun) gives Monday"
);

// Rest override on a template training day (Mon) → next training day (Wed)
// Mon 2026-10-26 is a training day in 3-day template, but user tapped Rest
// nextTrainingDay must return Wednesday (offset 1+), never today
const nextFromMonOverride = nextTrainingDay(days3, "2026-10-26");
assert(
  nextFromMonOverride?.dayName === "Wednesday" && nextFromMonOverride?.dayIndex === 3,
  "Rest override on template training day (Mon) gives next training day (Wed), not today"
);

// 4-day plan check: Signup on Saturday 2026-10-24 → Monday 2026-10-26
const nextFromSat4 = nextTrainingDay(days4, "2026-10-24");
assert(
  nextFromSat4?.dayName === "Monday" && nextFromSat4?.dayIndex === 1,
  "4-day plan: Signup on Saturday 2026-10-24 gives Monday"
);

console.log("\n=== Test 12: buildTodayState pure function ===\n");

// Test that buildTodayState correctly derives all state
const buildStateResult = buildTodayState({
  profile: {
    created_at: "2026-10-20T10:00:00Z",
    timezone: "UTC",
  },
  program: {
    id: TEST_PROGRAM_ID,
    started_on: "2026-10-20",
  },
  days: days3,
  sessions: {
    today: [],
    yesterday: [],
  },
  timezone: "UTC",
  localToday: "2026-10-23", // Fri (training day)
  yesterday: "2026-10-22", // Thu (rest day)
  dayType: "weights",
  strengthDone: false,
  strengthOpen: false,
  hasStartedSession: false,
});

assert(
  buildStateResult.promptType === "none",
  "buildTodayState: training day with no missed yesterday returns 'none'"
);
assert(
  !buildStateResult.missedYesterday,
  "buildTodayState: rest day yesterday not missed"
);
assert(
  buildStateResult.isTraining,
  "buildTodayState: correctly identifies training day"
);

// Test that page.tsx mutations would be caught
// Mutation 1: page.tsx setting answeredToday = false
const mutationTest1 = buildTodayState({
  profile: {
    created_at: "2026-10-20T10:00:00Z",
    timezone: "UTC",
  },
  program: {
    id: TEST_PROGRAM_ID,
    started_on: "2026-10-20",
  },
  days: days3,
  sessions: {
    today: [{ status: "planned", actual_type: "rest", program_id: TEST_PROGRAM_ID, started_at: null }],
    yesterday: [],
  },
  timezone: "UTC",
  localToday: "2026-10-23",
  yesterday: "2026-10-22",
  dayType: "weights",
  strengthDone: false,
  strengthOpen: false,
  hasStartedSession: false,
});

assert(
  mutationTest1.answeredToday,
  "buildTodayState detects answered=true from sessions (mutation 1 caught)"
);

// Test buildTodayState with today overridden to rest
const restOverrideTest = buildTodayState({
  profile: {
    created_at: "2026-10-20T10:00:00Z",
    timezone: "UTC",
  },
  program: {
    id: TEST_PROGRAM_ID,
    started_on: "2026-10-20",
  },
  days: days3,
  sessions: {
    today: [{ status: "planned", actual_type: "rest", program_id: TEST_PROGRAM_ID, started_at: null }],
    yesterday: [],
  },
  timezone: "UTC",
  localToday: "2026-10-24", // Sat (training day in 3-day template)
  yesterday: "2026-10-23", // Fri
  dayType: "rest", // Overridden to rest
  strengthDone: false,
  strengthOpen: false,
  hasStartedSession: false,
});

assert(
  restOverrideTest.promptType === "rest_plan",
  "buildTodayState: rest override on training day returns 'rest_plan' (shows rest content)"
);
assert(
  !restOverrideTest.isTraining,
  "buildTodayState: rest override is not a training day"
);
assert(
  restOverrideTest.nextTrainingDay?.dayName === "Monday",
  "buildTodayState: rest override on Sat gives Monday as next training day, not today"
);

console.log("\n=== Test 13: Timezone UTC vs IST boundary ===\n");

// created_at: 2026-10-22T19:00Z (00:30 IST on Sat 10-23)
// started_on: 2026-10-20 (Wed)
// date: 2026-10-22 (Fri, before local signup day Sat 10-23)
// timezone: Asia/Kolkata
// Fri 2026-10-22 is BEFORE the user's local signup day (Sat 2026-10-23), so NOT missed
const timezoneResult = isMissedTrainingDay({
  date: "2026-10-22", // Fri (before local signup day)
  programStartedOn: "2026-10-20", // Wed
  profileCreatedAt: "2026-10-22T19:00:00Z", // 00:30 IST on Sat 10-23
  timezone: "Asia/Kolkata",
  programId: TEST_PROGRAM_ID,
  templateDayType: "weights",
  sessions: [],
  hasStartedAny: true,
});

assert(
  !timezoneResult,
  "Timezone test: Fri 10-22 before local signup (Sat 10-23 00:30 IST) is NOT missed"
);

console.log("\n=== Test 14: 'both' state renders single prompt ===\n");

// Test the 'both' state to ensure it returns the correct prompt type
// 2026-10-24 is Sat (rest day), 2026-10-23 is Fri (training day)
const bothStateTest = buildTodayState({
  profile: {
    created_at: "2026-10-20T10:00:00Z",
    timezone: "UTC",
  },
  program: {
    id: TEST_PROGRAM_ID,
    started_on: "2026-10-20",
  },
  days: days3,
  sessions: {
    today: [],
    yesterday: [],
  },
  timezone: "UTC",
  localToday: "2026-10-24", // Sat (rest day)
  yesterday: "2026-10-23", // Fri (training day that was missed)
  dayType: "rest",
  strengthDone: false,
  strengthOpen: false,
  hasStartedSession: true,
});

assert(
  bothStateTest.promptType === "both",
  "'both' state: rest day with missed training yesterday returns 'both'"
);
assert(
  bothStateTest.missedYesterday,
  "'both' state: correctly identifies missed yesterday"
);
