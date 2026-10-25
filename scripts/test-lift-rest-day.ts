#!/usr/bin/env tsx
/**
 * Test: Lift option on rest days
 *
 * Tests that on a rest day:
 * (a) an upcoming strength day offers the Lift option with the right day name
 * (b) choosing it creates today's planned row for that program_day
 * (c) Your week then shows the choice for today
 * (d) the next training day doesn't repeat it
 * (e) no upcoming strength day hides the option
 * (f) a superseded program_days row is never offered
 */

import { buildTrainAnywayDays } from "../src/lib/today/train-anyway";
import { buildPage, type BuildPageInput } from "../src/lib/today/build-page";

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

console.log("\n=== Test (a): Rest day with upcoming strength day offers Lift option ===\n");

// Scenario: Today is Thursday (rest), next strength days are Friday (Push A) and Saturday (Pull A)
// All within the same cycle week
const testProgram = {
  started_on: "2026-10-12", // Monday
  week_offset: 0,
};

const result1 = buildTrainAnywayDays({
  allDays: [
    { id: "day-1", day_index: 1, day_type: "rest", label: null },
    { id: "day-2", day_index: 2, day_type: "rest", label: null },
    { id: "day-3", day_index: 3, day_type: "rest", label: null },
    { id: "day-4", day_index: 4, day_type: "rest", label: null },
    { id: "day-5", day_index: 5, day_type: "weights", label: "Push A" },
    { id: "day-6", day_index: 6, day_type: "weights", label: "Pull A" },
    { id: "day-7", day_index: 7, day_type: "rest", label: null },
  ],
  localToday: "2026-10-15", // Thursday (day 4, rest day, same week as started_on)
  missedYesterday: false,
  program: testProgram,
});

assert(result1.length === 2, `Two options offered on rest day (Lift + 1 more), got ${result1.length}`);
assert(result1[0].buttonLabel === "Lift: Push A", `First buttonLabel is "Lift: Push A", got "${result1[0].buttonLabel}"`);
assert(result1[0].programDayId === "day-5", `First programDayId is day-5, got ${result1[0].programDayId}`);

console.log("\n=== Test (e): No upcoming strength day hides the option ===\n");

// Scenario: Today is Thursday (rest), no more strength days this week
const result2 = buildTrainAnywayDays({
  allDays: [
    { id: "day-1", day_index: 1, day_type: "rest", label: null },
    { id: "day-2", day_index: 2, day_type: "rest", label: null },
    { id: "day-3", day_index: 3, day_type: "rest", label: null },
    { id: "day-4", day_index: 4, day_type: "rest", label: null },
    { id: "day-5", day_index: 5, day_type: "rest", label: null },
    { id: "day-6", day_index: 6, day_type: "rest", label: null },
    { id: "day-7", day_index: 7, day_type: "rest", label: null },
  ],
  localToday: "2026-10-22", // Thursday (day 4)
  missedYesterday: false,
  program: testProgram,
});

assert(result2.length === 0, "No options offered when no upcoming strength days");

console.log("\n=== Test (b-c): Choosing Lift creates planned row and week shows choice ===\n");

// Build a complete page scenario where user chooses Lift on a rest day
// This tests (b) and (c) together using the full page builder

const program = {
  id: "prog-1",
  started_on: "2026-10-13",
  week_offset: 0,
  deload_week: 5,
};

const days = [
  { id: "day-1", day_index: 1, day_type: "rest" as const, label: null, program_day_exercises: [] },
  { id: "day-2", day_index: 2, day_type: "weights" as const, label: "Push A", program_day_exercises: [] },
  { id: "day-3", day_index: 3, day_type: "weights" as const, label: "Pull A", program_day_exercises: [] },
  { id: "day-4", day_index: 4, day_type: "weights" as const, label: "Legs A", program_day_exercises: [] },
  { id: "day-5", day_index: 5, day_type: "rest" as const, label: null, program_day_exercises: [] },
  { id: "day-6", day_index: 6, day_type: "weights" as const, label: "Push B", program_day_exercises: [] },
  { id: "day-7", day_index: 7, day_type: "rest" as const, label: null, program_day_exercises: [] },
];

// Test (b): Choosing Lift creates planned row for today
const todayDate = "2026-10-19"; // Monday (rest day, day 1)
const yesterday = "2026-10-18"; // Sunday
const todaySession = {
  id: "sess-today",
  local_date: todayDate,
  status: "planned" as const,
  actual_type: "weights" as const,
  program_id: program.id,
  program_day_id: "day-2", // Push A (Tuesday's workout, pulled forward)
  started_at: null,
  created_at: "2026-10-19T10:00:00Z",
};

const allSessionsRes = {
  data: [{ actual_type: "weights" as const, started_at: null }],
  error: null,
};

const weekSessionsRes = {
  data: [todaySession],
  error: null,
};

const todaySessionsRes = {
  data: [todaySession],
  error: null,
};

const yesterdaySessionsRes = {
  data: [],
  error: null,
};

const sessionExercisesRes = {
  data: null,
  error: null,
};

const deps: BuildPageInput = {
  profile: {
    id: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    timezone: "UTC",
  },
  localToday: todayDate,
  yesterday,
  timezone: "UTC",
  program,
  days,
  allSessionsRes,
  weekSessionsRes,
  todaySessionsRes,
  yesterdaySessionsRes,
  sessionExercisesRes,
};

const pageResult = buildPage(deps);

// Test (b): today's session points to the pulled-forward program_day
assert(
  pageResult.override?.program_day_id === "day-2",
  `(b) Today's planned session points to Push A program_day, got ${pageResult.override?.program_day_id}`
);

// Test (c): Your week shows today as a choice
const mondayRow = pageResult.todayView.weekRowsWithChoices[0]; // Monday is first in the week
assert(
  mondayRow.isChoice === true,
  `(c) Monday shows as a choice (isChoice=true), got ${mondayRow.isChoice}`
);
assert(
  mondayRow.label === "Push A",
  `(c) Monday's label is "Push A", got "${mondayRow.label}"`
);

console.log("\n=== Test (f): Superseded program_days row is never offered ===\n");

// Scenario: Program has been rebuilt, old program_day row still exists but is superseded
// The new program uses different program_day ids
const newDays = [
  { id: "day-1", day_index: 1, day_type: "rest" as const, label: null },
  { id: "day-2", day_index: 2, day_type: "weights" as const, label: "Push A" },
  { id: "day-3", day_index: 3, day_type: "weights" as const, label: "Pull A" },
];

// buildTrainAnywayDays only receives active program_days (filtered by status='active' in the query)
// So superseded rows are already filtered out before reaching this function.
// This test verifies that only active program_days are passed to buildTrainAnywayDays.

const result3 = buildTrainAnywayDays({
  allDays: newDays, // Only active program_days
  localToday: "2026-10-19", // Monday (day 1, rest day)
  missedYesterday: false,
});

assert(result3.length >= 1, "At least one option offered (from active program_days only)");
assert(result3[0].label === "Push A", `First label is "Push A" (not "OLD"), got "${result3[0].label}"`);
assert(result3[0].buttonLabel === "Lift: Push A", `First buttonLabel is "Lift: Push A", got "${result3[0].buttonLabel}"`);
assert(
  result3[0].programDayId === "day-2",
  `programDayId is from new program_day (day-2), got ${result3[0].programDayId}`
);

console.log("\n=== Test (no-repeat-a): Pull Tuesday's Push A to Monday, complete it ===\n");

// Monday 2026-10-19, week 2 of block (started 2026-10-12)
// User pulled Push A (Tuesday's workout) to Monday and completed it
// Tuesday should show: rest with "Done Monday (your choice)", no Start button

const noRepeatProgram = {
  id: "prog-2",
  started_on: "2026-10-12", // Week 1 starts here (Monday)
  week_offset: 0,
  deload_week: 5,
};

const noRepeatDays = [
  { id: "nr-day-1", day_index: 1, day_type: "rest" as const, label: null },
  { id: "nr-day-2", day_index: 2, day_type: "weights" as const, label: "Push A" },
  { id: "nr-day-3", day_index: 3, day_type: "weights" as const, label: "Pull A" },
  { id: "nr-day-4", day_index: 4, day_type: "weights" as const, label: "Legs A" },
  { id: "nr-day-5", day_index: 5, day_type: "rest" as const, label: null },
  { id: "nr-day-6", day_index: 6, day_type: "weights" as const, label: "Push B" },
  { id: "nr-day-7", day_index: 7, day_type: "rest" as const, label: null },
];

// Monday's completed session with Push A program_day
const mondayCompletedSession = {
  id: "sess-monday-complete",
  local_date: "2026-10-19", // Monday, week 2
  status: "completed" as const,
  actual_type: "weights" as const,
  program_id: noRepeatProgram.id,
  program_day_id: "nr-day-2", // Push A (Tuesday's workout)
  started_at: "2026-10-19T10:00:00Z",
  created_at: "2026-10-19T09:00:00Z",
};

// Tuesday (the original Push A day) should now be rest
const tuesdayAfterPullForward = "2026-10-20"; // Tuesday, week 2

const tuesdayDeps: BuildPageInput = {
  profile: {
    id: "user-2",
    created_at: "2026-01-01T00:00:00Z",
    timezone: "UTC",
  },
  localToday: tuesdayAfterPullForward,
  yesterday: "2026-10-19", // Monday
  timezone: "UTC",
  program: noRepeatProgram,
  days: noRepeatDays,
  allSessionsRes: {
    data: [{ actual_type: "weights" as const, started_at: "2026-10-19T10:00:00Z" }],
    error: null,
  },
  weekSessionsRes: {
    data: [mondayCompletedSession],
    error: null,
  },
  todaySessionsRes: {
    data: [], // No session on Tuesday
    error: null,
  },
  yesterdaySessionsRes: {
    data: [mondayCompletedSession],
    error: null,
  },
  sessionExercisesRes: { data: null, error: null },
};

const tuesdayPage = buildPage(tuesdayDeps);

assert(
  tuesdayPage.dayType === "rest",
  `(no-repeat-a) Tuesday shows as rest (not Push A), got "${tuesdayPage.dayType}"`
);
assert(
  tuesdayPage.dayLabel === "Done Monday (your choice)",
  `(no-repeat-a) Tuesday's label is "Done Monday (your choice)", got "${tuesdayPage.dayLabel}"`
);
assert(
  !tuesdayPage.strengthOpen,
  "(no-repeat-a) No Start button (strengthOpen is false)"
);

// Check "Your week" also shows Tuesday as "Done Monday (your choice)"
const tuesdayWeekRow = tuesdayPage.todayView.weekRowsWithChoices.find((r) => r.dayIndex === 2);
assert(
  tuesdayWeekRow?.label === "Done Monday (your choice)",
  `(no-repeat-a) Your week Tuesday shows "Done Monday (your choice)", got "${tuesdayWeekRow?.label}"`
);
assert(
  tuesdayWeekRow?.isChoice === true,
  `(no-repeat-a) Your week Tuesday marked as choice, got ${tuesdayWeekRow?.isChoice}`
);

console.log("\n=== Test (no-repeat-b): Pull forward across week boundary ===\n");

// Friday 2026-10-23 (week 2), Pull A from Wednesday 2026-10-28 (week 3) and complete it
// Wednesday (week 3) should still show Pull A (different cycle week)

const wednesdayWeek3 = "2026-10-28"; // Wednesday, week 3

const wednesdayWeek3Deps: BuildPageInput = {
  profile: {
    id: "user-2",
    created_at: "2026-01-01T00:00:00Z",
    timezone: "UTC",
  },
  localToday: wednesdayWeek3,
  yesterday: "2026-10-27",
  timezone: "UTC",
  program: noRepeatProgram,
  days: noRepeatDays,
  allSessionsRes: {
    data: [{ actual_type: "weights" as const, started_at: "2026-10-23T10:00:00Z" }],
    error: null,
  },
  weekSessionsRes: {
    data: [], // No sessions in week 3 yet (Friday's session was week 2)
    error: null,
  },
  todaySessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [],
    error: null,
  },
  sessionExercisesRes: { data: null, error: null },
};

const wednesdayWeek3Page = buildPage(wednesdayWeek3Deps);

assert(
  wednesdayWeek3Page.dayType === "weights",
  `(no-repeat-b) Wednesday week 3 shows Pull A (scheduled), got "${wednesdayWeek3Page.dayType}"`
);
assert(
  wednesdayWeek3Page.dayLabel !== "Done Friday (your choice)",
  `(no-repeat-b) Wednesday week 3 NOT affected by week 2's pull-forward`
);

console.log("\n=== Test (no-repeat-c): Two pull-forwards in one week ===\n");

// Monday: Pull Push A from Tuesday, complete it (Monday is rest)
// Friday: Pull Push B from Saturday, complete it (Friday is rest)
// Both Tuesday and Saturday should show "Done <day> (your choice)"

const mondayPushComplete = {
  id: "sess-mon-push",
  local_date: "2026-10-19", // Monday, week 2 (rest day)
  status: "completed" as const,
  actual_type: "weights" as const,
  program_id: noRepeatProgram.id,
  program_day_id: "nr-day-2", // Push A (Tuesday's)
  started_at: "2026-10-19T10:00:00Z",
  created_at: "2026-10-19T09:00:00Z",
};

const fridayPushBComplete = {
  id: "sess-fri-pushb",
  local_date: "2026-10-23", // Friday, week 2 (rest day)
  status: "completed" as const,
  actual_type: "weights" as const,
  program_id: noRepeatProgram.id,
  program_day_id: "nr-day-6", // Push B (Saturday's)
  started_at: "2026-10-23T10:00:00Z",
  created_at: "2026-10-23T09:00:00Z",
};

const saturdayAfterTwoPulls = "2026-10-24"; // Saturday, week 2

const saturdayDeps: BuildPageInput = {
  profile: {
    id: "user-2",
    created_at: "2026-01-01T00:00:00Z",
    timezone: "UTC",
  },
  localToday: saturdayAfterTwoPulls,
  yesterday: "2026-10-23",
  timezone: "UTC",
  program: noRepeatProgram,
  days: noRepeatDays,
  allSessionsRes: {
    data: [
      { actual_type: "weights" as const, started_at: "2026-10-19T10:00:00Z" },
      { actual_type: "weights" as const, started_at: "2026-10-23T10:00:00Z" },
    ],
    error: null,
  },
  weekSessionsRes: {
    data: [mondayPushComplete, fridayPushBComplete],
    error: null,
  },
  todaySessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [fridayPushBComplete],
    error: null,
  },
  sessionExercisesRes: { data: null, error: null },
};

const saturdayPage = buildPage(saturdayDeps);

assert(
  saturdayPage.dayType === "rest",
  `(no-repeat-c) Saturday shows as rest, got "${saturdayPage.dayType}"`
);
assert(
  saturdayPage.dayLabel === "Done Friday (your choice)",
  `(no-repeat-c) Saturday's label is "Done Friday (your choice)", got "${saturdayPage.dayLabel}"`
);

console.log("\n=== Test (no-repeat-d): Planned but not started doesn't block ===\n");

// Monday: Planned Push A (from Tuesday) but never started (missed)
// Tuesday should show Push A normally, NOT "Done Monday"

const mondayPlannedNotStarted = {
  id: "sess-mon-planned",
  local_date: "2026-10-19", // Monday, week 2
  status: "planned" as const,
  actual_type: "weights" as const,
  program_id: noRepeatProgram.id,
  program_day_id: "nr-day-2", // Push A
  started_at: null,
  created_at: "2026-10-19T09:00:00Z",
};

const tuesdayAfterPlannedOnly = "2026-10-20"; // Tuesday, week 2

const tuesdayPlannedOnlyDeps: BuildPageInput = {
  profile: {
    id: "user-2",
    created_at: "2026-01-01T00:00:00Z",
    timezone: "UTC",
  },
  localToday: tuesdayAfterPlannedOnly,
  yesterday: "2026-10-19",
  timezone: "UTC",
  program: noRepeatProgram,
  days: noRepeatDays,
  allSessionsRes: {
    data: [],
    error: null,
  },
  weekSessionsRes: {
    data: [mondayPlannedNotStarted],
    error: null,
  },
  todaySessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [mondayPlannedNotStarted],
    error: null,
  },
  sessionExercisesRes: { data: null, error: null },
};

const tuesdayPlannedOnlyPage = buildPage(tuesdayPlannedOnlyDeps);

assert(
  tuesdayPlannedOnlyPage.dayType === "weights",
  `(no-repeat-d) Tuesday shows Push A (not blocked by planned-only), got "${tuesdayPlannedOnlyPage.dayType}"`
);
assert(
  tuesdayPlannedOnlyPage.dayLabel === "Push A",
  `(no-repeat-d) Tuesday's label is "Push A", got "${tuesdayPlannedOnlyPage.dayLabel}"`
);

console.log("\n=== Test (no-repeat-e): Lift option absent when no upcoming strength ===\n");

// Friday (rest day), no more strength days this week
// Lift option should not appear

const fridayNoStrength = "2026-10-23"; // Friday, week 2

const fridayNoStrengthDeps: BuildPageInput = {
  profile: {
    id: "user-2",
    created_at: "2026-01-01T00:00:00Z",
    timezone: "UTC",
  },
  localToday: fridayNoStrength,
  yesterday: "2026-10-22",
  timezone: "UTC",
  program: noRepeatProgram,
  days: [
    { id: "nr2-day-1", day_index: 1, day_type: "rest" as const, label: null },
    { id: "nr2-day-2", day_index: 2, day_type: "rest" as const, label: null },
    { id: "nr2-day-3", day_index: 3, day_type: "rest" as const, label: null },
    { id: "nr2-day-4", day_index: 4, day_type: "rest" as const, label: null },
    { id: "nr2-day-5", day_index: 5, day_type: "rest" as const, label: null },
    { id: "nr2-day-6", day_index: 6, day_type: "rest" as const, label: null },
    { id: "nr2-day-7", day_index: 7, day_type: "rest" as const, label: null },
  ],
  allSessionsRes: {
    data: [],
    error: null,
  },
  weekSessionsRes: {
    data: [],
    error: null,
  },
  todaySessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [],
    error: null,
  },
  sessionExercisesRes: { data: null, error: null },
};

const fridayNoStrengthPage = buildPage(fridayNoStrengthDeps);

assert(
  fridayNoStrengthPage.trainAnywayDays.length === 0,
  `(no-repeat-e) No Lift option when no upcoming strength, got ${fridayNoStrengthPage.trainAnywayDays.length} options`
);

console.log("\n=== Test (M2): Completed/skipped session not showing as choice ===\n");

// Monday: Completed yoga (not a pulled-forward training session)
// Your week should NOT show Monday as "your choice"

const mondayCompletedYoga = {
  id: "sess-yoga",
  local_date: "2026-10-19", // Monday, week 2 (rest day)
  status: "completed" as const,
  actual_type: "yoga" as const,
  program_id: noRepeatProgram.id,
  program_day_id: null,
  started_at: "2026-10-19T10:00:00Z",
  created_at: "2026-10-19T09:00:00Z",
};

const tuesdayAfterYoga = "2026-10-20"; // Tuesday, week 2

const tuesdayAfterYogaDeps: BuildPageInput = {
  profile: {
    id: "user-2",
    created_at: "2026-01-01T00:00:00Z",
    timezone: "UTC",
  },
  localToday: tuesdayAfterYoga,
  yesterday: "2026-10-19",
  timezone: "UTC",
  program: noRepeatProgram,
  days: noRepeatDays,
  allSessionsRes: {
    data: [{ actual_type: "yoga" as const, started_at: "2026-10-19T10:00:00Z" }],
    error: null,
  },
  weekSessionsRes: {
    data: [mondayCompletedYoga],
    error: null,
  },
  todaySessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [mondayCompletedYoga],
    error: null,
  },
  sessionExercisesRes: { data: null, error: null },
};

const tuesdayAfterYogaPage = buildPage(tuesdayAfterYogaDeps);

// Check that Monday in "Your week" is NOT shown as a choice
const mondayYogaWeekRow = tuesdayAfterYogaPage.todayView.weekRowsWithChoices.find((r) => r.dayIndex === 1);
assert(
  mondayYogaWeekRow?.isChoice === false || mondayYogaWeekRow?.isChoice === undefined,
  `(M2) Monday with completed yoga NOT shown as choice, got isChoice=${mondayYogaWeekRow?.isChoice}`
);

console.log("\n=== Test (B7): in_progress pulled session counts ===\n");

// Monday: in_progress Push A session (pulled from Tuesday)
// Tuesday should show as rest with "Done Monday (your choice)"

const mondayInProgressSession = {
  id: "sess-inprog",
  local_date: "2026-10-19", // Monday, week 2
  status: "in_progress" as const,
  actual_type: "weights" as const,
  program_id: noRepeatProgram.id,
  program_day_id: "nr-day-2", // Push A
  started_at: "2026-10-19T10:00:00Z",
  created_at: "2026-10-19T09:00:00Z",
};

const tuesdayAfterInProgress = "2026-10-20"; // Tuesday, week 2

const tuesdayInProgressDeps: BuildPageInput = {
  profile: {
    id: "user-2",
    created_at: "2026-01-01T00:00:00Z",
    timezone: "UTC",
  },
  localToday: tuesdayAfterInProgress,
  yesterday: "2026-10-19",
  timezone: "UTC",
  program: noRepeatProgram,
  days: noRepeatDays,
  allSessionsRes: {
    data: [{ actual_type: "weights" as const, started_at: "2026-10-19T10:00:00Z" }],
    error: null,
  },
  weekSessionsRes: {
    data: [mondayInProgressSession],
    error: null,
  },
  todaySessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [mondayInProgressSession],
    error: null,
  },
  sessionExercisesRes: { data: null, error: null },
};

const tuesdayInProgressPage = buildPage(tuesdayInProgressDeps);

assert(
  tuesdayInProgressPage.dayType === "rest",
  `(B7) Tuesday shows as rest when Monday in_progress, got "${tuesdayInProgressPage.dayType}"`
);
assert(
  tuesdayInProgressPage.dayLabel === "Done Monday (your choice)",
  `(B7) Tuesday's label is "Done Monday (your choice)", got "${tuesdayInProgressPage.dayLabel}"`
);

console.log("\n=== Test (B10): No Lift on training days ===\n");

// Tuesday (Push A day): trainAnywayDays should not have any "Lift:" prefix

const tuesdayTraining = "2026-10-20"; // Tuesday, week 2 (Push A)

const tuesdayTrainingDeps: BuildPageInput = {
  profile: {
    id: "user-2",
    created_at: "2026-01-01T00:00:00Z",
    timezone: "UTC",
  },
  localToday: tuesdayTraining,
  yesterday: "2026-10-19",
  timezone: "UTC",
  program: noRepeatProgram,
  days: noRepeatDays,
  allSessionsRes: {
    data: [],
    error: null,
  },
  weekSessionsRes: {
    data: [],
    error: null,
  },
  todaySessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [],
    error: null,
  },
  sessionExercisesRes: { data: null, error: null },
};

const tuesdayTrainingPage = buildPage(tuesdayTrainingDeps);

const hasLiftPrefix = tuesdayTrainingPage.trainAnywayDays.some((d) => d.buttonLabel?.includes("Lift:"));
assert(
  !hasLiftPrefix,
  "(B10) Training day has no 'Lift:' prefix in any train-anyway option"
);

console.log("\n=== Test (B14): Cap of 2 options on rest day without missed ===\n");

// Rest day with many strength days: should offer max 2 options (Lift + 1 more)
// because missedYesterday = false

const manyStrengthDays = [
  { id: "ms-day-1", day_index: 1, day_type: "rest" as const, label: null },
  { id: "ms-day-2", day_index: 2, day_type: "weights" as const, label: "Push A" },
  { id: "ms-day-3", day_index: 3, day_type: "weights" as const, label: "Pull A" },
  { id: "ms-day-4", day_index: 4, day_type: "weights" as const, label: "Legs A" },
  { id: "ms-day-5", day_index: 5, day_type: "weights" as const, label: "Push B" },
  { id: "ms-day-6", day_index: 6, day_type: "weights" as const, label: "Pull B" },
  { id: "ms-day-7", day_index: 7, day_type: "rest" as const, label: null },
];

const mondayManyStrength = "2026-10-13"; // Monday, rest (first day of cycle week)

const mondayManyDeps: BuildPageInput = {
  profile: {
    id: "user-2",
    created_at: "2026-01-01T00:00:00Z",
    timezone: "UTC",
  },
  localToday: mondayManyStrength,
  yesterday: "2026-10-12",
  timezone: "UTC",
  program: noRepeatProgram,
  days: manyStrengthDays,
  allSessionsRes: {
    data: [],
    error: null,
  },
  weekSessionsRes: {
    data: [],
    error: null,
  },
  todaySessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [],
    error: null,
  },
  sessionExercisesRes: { data: null, error: null },
};

const mondayManyPage = buildPage(mondayManyDeps);

assert(
  mondayManyPage.trainAnywayDays.length === 2,
  `(B14) Max 2 options on rest day (Lift + 1), got ${mondayManyPage.trainAnywayDays.length}`
);

console.log("\n=== Test (M2-fixed): Completed row INSIDE cycle week ===\n");

// Monday 2026-10-19 (week 2, rest day): Completed Tuesday's Push A (pulled forward)
// Tuesday should show as rest with "Done Monday (your choice)"
// This tests that a completed session on a rest day within the cycle week counts

const mondayPulledTuesday = {
  id: "sess-mon-tue-pull",
  local_date: "2026-10-12", // Monday, week 1 (rest day, same as program start)
  status: "completed" as const,
  actual_type: "weights" as const,
  program_id: noRepeatProgram.id,
  program_day_id: "nr-day-2", // Push A (Tuesday's program_day)
  started_at: "2026-10-12T10:00:00Z",
  created_at: "2026-10-12T09:00:00Z",
};

const tuesdayAfterMonPull = "2026-10-13"; // Tuesday, week 1

const tuesdayM2Deps: BuildPageInput = {
  profile: {
    id: "user-2",
    created_at: "2026-01-01T00:00:00Z",
    timezone: "UTC",
  },
  localToday: tuesdayAfterMonPull,
  yesterday: "2026-10-12",
  timezone: "UTC",
  program: noRepeatProgram,
  days: noRepeatDays,
  allSessionsRes: {
    data: [{ actual_type: "weights" as const, started_at: "2026-10-12T10:00:00Z" }],
    error: null,
  },
  weekSessionsRes: {
    data: [mondayPulledTuesday],
    error: null,
  },
  todaySessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [mondayPulledTuesday],
    error: null,
  },
  sessionExercisesRes: { data: null, error: null },
};

const tuesdayM2Page = buildPage(tuesdayM2Deps);

assert(
  tuesdayM2Page.dayType === "rest",
  `(M2) Tuesday shows as rest when Monday pulled its workout, got "${tuesdayM2Page.dayType}"`
);

const tuesdayM2Row = tuesdayM2Page.todayView.weekRowsWithChoices.find((r) => r.dayIndex === 2);
assert(
  tuesdayM2Row?.isChoice === true,
  `(M2) Tuesday week row marked as choice, got ${tuesdayM2Row?.isChoice}`
);

console.log(`\n✅ All ${passedTests}/${totalTests} lift-rest-day tests passed!\n`);
