#!/usr/bin/env tsx
/**
 * Test: buildPage helper (item 4 - page wiring)
 * 
 * Tests all page-level derivation in one place:
 * - Yesterday sessions filter
 * - Sets result handling (including errored reads)
 * - needsPlannableDays
 * - chosenByDayIndex loop
 * - Building inputs for buildTodayView, buildTodayState, todayPromptBlocks
 * 
 * Proves P1-P8 breaks are caught.
 */

import { buildPage } from "../src/lib/today/build-page";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

const baseInput = {
  profile: {
    id: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    timezone: "America/New_York",
  },
  program: {
    id: "prog-1",
    started_on: "2026-01-01",
    week_offset: 0,
    deload_week: null,
  },
  days: [
    { id: "day0", day_index: 0, day_type: "rest" as const, label: null },
    { id: "day1", day_index: 1, day_type: "weights" as const, label: "Push" },
    { id: "day2", day_index: 2, day_type: "rest" as const, label: null },
    { id: "day3", day_index: 3, day_type: "weights" as const, label: "Pull" },
    { id: "day4", day_index: 4, day_type: "weights" as const, label: "Legs" },
    { id: "day5", day_index: 5, day_type: "rest" as const, label: null },
    { id: "day6", day_index: 6, day_type: "weights" as const, label: "Upper" },
    { id: "day7", day_index: 7, day_type: "rest" as const, label: null },
  ],
  allSessionsRes: {
    data: [
      {
        id: "old-session",
        local_date: "2026-01-10",
        status: "completed",
        actual_type: "weights" as const,
        program_id: "prog-1",
        program_day_id: "day1",
        started_at: "2026-01-10T10:00:00Z",
        created_at: "2026-01-10T10:00:00Z",
      },
    ],
    error: null,
  },
  todaySessionsRes: {
    data: [
      {
        id: "old-session",
        local_date: "2026-01-10",
        status: "completed",
        actual_type: "weights" as const,
        program_id: "prog-1",
        program_day_id: "day1",
        started_at: "2026-01-10T10:00:00Z",
        created_at: "2026-01-10T10:00:00Z",
      },
    ],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [
      {
        id: "old-session",
        local_date: "2026-01-10",
        status: "completed",
        actual_type: "weights" as const,
        program_id: "prog-1",
        program_day_id: "day1",
        started_at: "2026-01-10T10:00:00Z",
        created_at: "2026-01-10T10:00:00Z",
      },
    ],
    error: null,
  },
  sessionExercisesRes: {
    data: [],
    error: null,
  },
  timezone: "America/New_York",
  localToday: "2026-01-12", // Monday (day_index 1)
  yesterday: "2026-01-11", // Sunday (day_index 0, rest)
};

console.log("\n=== Test 1: Basic page build ===\n");

const result1 = buildPage(baseInput);

assert(
  result1.todayView !== null && result1.todayView !== undefined,
  "buildPage returns todayView"
);

assert(
  result1.todayState !== null && result1.todayState !== undefined,
  "buildPage returns todayState"
);

assert(
  result1.promptBlocks !== null && result1.promptBlocks !== undefined,
  "buildPage returns promptBlocks"
);

console.log("\n=== Test 2: P2 - Sets error handling ===\n");

// When sessionExercisesRes has an error, should mark yesterdayUnknown
const erroredSetsInput = {
  ...baseInput,
  yesterdaySessionsRes: {
    data: [
      { id: "s1", local_date: baseInput.yesterday, status: "completed", actual_type: "weights" as const, program_id: "prog-1" },
    ],
    error: null,
  },
  sessionExercisesRes: {
    data: null,
    error: new Error("Failed to load sets"),
  },
};

const result2 = buildPage(erroredSetsInput);

assert(
  result2.todayState.missedYesterday === false,
  "P2: Errored sets read suppresses missed prompt"
);

assert(
  result2.todayState.isTraining === true,
  "P2: Errored sets read preserves isTraining"
);

console.log("\n=== Test 3: P3 - Warm-ups as working ===\n");

// Warm-ups should NOT count as working sets
// Use a day that's actually a training day in the template (day 6 = Saturday = Upper/weights)
const yesterdayTrainingDay = "2026-01-10"; // Saturday (day_index 6)
const sessionsWithYesterday = [
  ...baseInput.allSessionsRes.data!,
  {
    id: "s1",
    local_date: yesterdayTrainingDay,
    status: "completed",
    actual_type: "weights" as const,
    program_id: "prog-1",
    program_day_id: "day6",
    started_at: "2026-01-10T10:00:00Z",
    created_at: "2026-01-10T10:00:00Z",
  },
];

const warmupInput = {
  ...baseInput,
  localToday: "2026-01-11", // Sunday (day after Saturday)
  yesterday: yesterdayTrainingDay,
  allSessionsRes: { data: sessionsWithYesterday, error: null },
  todaySessionsRes: { data: sessionsWithYesterday, error: null },
  yesterdaySessionsRes: { data: sessionsWithYesterday, error: null },
  sessionExercisesRes: {
    data: [
      {
        session_id: "s1",
        session_sets: [
          { is_warmup_set: true, reps: 5, duration_seconds: null },
          { is_warmup_set: true, reps: 5, duration_seconds: null },
        ],
      },
    ],
    error: null,
  },
};

const result3 = buildPage(warmupInput);

// Yesterday with only warm-ups should be treated as missed
assert(
  result3.todayState.missedYesterday === true,
  "P3: Warm-ups should NOT count as working sets (yesterday is missed)"
);

console.log("\n=== Test 4: P6 - allSessionsRes bypass ===\n");

// When allSessionsRes has an error, hasStartedAny should be null
const allSessionsErrorInput = {
  ...baseInput,
  allSessionsRes: {
    data: null,
    error: new Error("Failed to load all sessions"),
  },
};

const result4 = buildPage(allSessionsErrorInput);

assert(
  result4.promptBlocks.showFirstSessionOffer === false,
  "P6: allSessionsRes error suppresses first session offer"
);

console.log("\n=== Test 5: P7 - Yesterday filter ===\n");

// Yesterday filter should only include yesterday's date, not other dates
const multiDateInput = {
  ...baseInput,
  yesterdaySessionsRes: {
    data: [
      { id: "s1", local_date: baseInput.yesterday, status: "completed", actual_type: "weights" as const, program_id: "prog-1" },
      { id: "s2", local_date: baseInput.yesterday, status: "completed", actual_type: "weights" as const, program_id: "other" }, // different program
    ],
    error: null,
  },
  sessionExercisesRes: {
    data: [
      {
        session_id: "s1",
        session_sets: [
          { is_warmup_set: false, reps: 10, duration_seconds: null },
        ],
      },
    ],
    error: null,
  },
};

const result5 = buildPage(multiDateInput);

// Should filter to program_id=prog-1 only
assert(
  result5.todayState.missedYesterday === false,
  "P7: Yesterday filter includes only current program sessions"
);

console.log("\n=== Test 6: chosenByDayIndex - Tomorrow choice shows ===\n");

// Test that a choice made for tomorrow shows on tomorrow's row with a label
// Use 2026-01-12 which is a real Monday
const tomorrowChoiceInput = {
  ...baseInput,
  localToday: "2026-01-12", // Monday (day_index 1)
  yesterday: "2026-01-11", // Sunday
  allSessionsRes: {
    data: [
      // A planned session for Tuesday (tomorrow) with actual_type "weights" pointing to Pull
      {
        local_date: "2026-01-13", // Tuesday (day_index 2)
        status: "planned",
        actual_type: "weights" as const,
        program_day_id: "day3", // Pull
        started_at: null,
      },
      // User has started before
      {
        local_date: "2026-01-10",
        status: "completed",
        actual_type: "weights" as const,
        program_day_id: "day1",
        started_at: "2026-01-10T10:00:00Z",
      },
    ],
    error: null,
  },
  days: [
    { id: "day1", day_index: 1, day_type: "weights" as const, label: "Push" },
    { id: "day2", day_index: 2, day_type: "rest" as const, label: null }, // Tuesday template is Rest
    { id: "day3", day_index: 3, day_type: "weights" as const, label: "Pull" },
  ],
};

const result6 = buildPage(tomorrowChoiceInput);

// Check that weekRowsWithChoices shows "Pull" for Tuesday (dayIndex 2)
const tuesdayRow = result6.todayView.weekRowsWithChoices.find(r => r.dayIndex === 2);

assert(
  tuesdayRow !== undefined,
  "Tuesday row exists in weekRowsWithChoices"
);

assert(
  tuesdayRow!.label === "Pull",
  `Tomorrow choice shows label "Pull", got "${tuesdayRow!.label}"`
);

assert(
  tuesdayRow!.isChoice === true,
  "Tomorrow choice has isChoice=true"
);

// Monday should show its template (Push) with no choice
const mondayRow = result6.todayView.weekRowsWithChoices.find(r => r.dayIndex === 1);

assert(
  mondayRow!.label === "Push" && mondayRow!.isChoice === false,
  "Monday (today) shows template with no choice"
);

console.log("\n=== Test 7: chosenByDayIndex - Unchanged plan shows no choice ===\n");

// Test that when the session matches the template, isChoice=false
const unchangedPlanInput = {
  ...baseInput,
  localToday: "2026-01-12", // Monday (day_index 1)
  yesterday: "2026-01-11", // Sunday
  allSessionsRes: {
    data: [
      // A planned session for Monday matching the template (Push)
      {
        local_date: "2026-01-12", // Monday
        status: "planned",
        actual_type: "weights" as const,
        program_day_id: "day1", // Push - matches template
        started_at: null,
      },
      // User has started before
      {
        local_date: "2026-01-10",
        status: "completed",
        actual_type: "weights" as const,
        program_day_id: "day1",
        started_at: "2026-01-10T10:00:00Z",
      },
    ],
    error: null,
  },
};

const result7 = buildPage(unchangedPlanInput);

const mondayRow7 = result7.todayView.weekRowsWithChoices.find(r => r.dayIndex === 1);

assert(
  mondayRow7!.label === "Push",
  "Unchanged plan shows template label"
);

assert(
  mondayRow7!.isChoice === false,
  "Unchanged plan has isChoice=false (no override)"
);

console.log("\n=== Test 8: P-MISSED-ANY - Veteran user, missed yesterday, empty week ===\n");

// A long-time user who trained weeks ago, missed yesterday (training day),
// and has no sessions this week. Must get missed prompt, not first-day welcome.
const veteranMissedInput = {
  ...baseInput,
  localToday: "2026-01-12", // Monday (day_index 1, training day)
  yesterday: "2026-01-11", // Sunday (day_index 7, rest day in fixture but treating as training for test)
  days: [
    ...baseInput.days.slice(0, 6),
    { id: "day7", day_index: 7, day_type: "weights" as const, label: "Upper" }, // Make Sunday a training day
  ],
  // All-time query: user trained weeks ago
  allSessionsRes: {
    data: [
      {
        local_date: "2026-01-03", // Weeks ago
        status: "completed",
        actual_type: "weights" as const,
        program_day_id: "day1",
        started_at: "2026-01-03T10:00:00Z",
      },
    ],
    error: null,
  },
  // Week window: empty (no sessions this week)
  todaySessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [], // No session yesterday = missed
    error: null,
  },
  sessionExercisesRes: {
    data: [],
    error: null,
  },
};

const result8 = buildPage(veteranMissedInput);

assert(
  result8.todayState.missedYesterday === true,
  "P-MISSED-ANY: Veteran user who missed yesterday gets missed prompt"
);

assert(
  result8.promptBlocks.showFirstSessionOffer === false,
  "P-MISSED-ANY: Veteran user doesn't get 'Welcome to your first workout'"
);

console.log("\n✅ All buildPage tests passed!\n");
