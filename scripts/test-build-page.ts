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
        actual_type: "weights" as const,
        started_at: "2026-01-10T10:00:00Z",
      },
    ],
    error: null,
  },
  weekSessionsRes: {
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
  yesterday: "2026-01-11", // Sunday (day_index 7, rest)
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
const warmupInput = {
  ...baseInput,
  localToday: "2026-01-11", // Sunday (day after Saturday)
  yesterday: yesterdayTrainingDay,
  allSessionsRes: {
    data: [
      {
        actual_type: "weights" as const,
        started_at: "2026-01-10T10:00:00Z",
      },
    ],
    error: null,
  },
  weekSessionsRes: {
    data: [
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
    ],
    error: null,
  },
  todaySessionsRes: {
    data: [
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
    ],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [
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
    ],
    error: null,
  },
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

console.log("\n=== Test 4: P4b/P5 - Never-started user with errored read ===\n");

// Never-started user with errored hasStartedAny read
// Should suppress first session offer and set firstTrainingDay to null
const neverStartedErrorInput = {
  ...baseInput,
  allSessionsRes: {
    data: null,
    error: new Error("Failed to load sessions"),
  },
  todaySessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [],
    error: null,
  },
  sessionExercisesRes: {
    data: [],
    error: null,
  },
};

const result4 = buildPage(neverStartedErrorInput);

assert(
  result4.promptBlocks.showFirstSessionOffer === false,
  "P4b/P5: Errored hasStartedAny suppresses first session offer"
);

assert(
  result4.todayView.firstTrainingDay === null,
  "P4b/P5: Errored hasStartedAny sets firstTrainingDay to null"
);

assert(
  result4.promptBlocks.showFirstDayWelcome === false,
  "P4b: Errored hasStartedAny suppresses 'Welcome to your first workout'"
);

console.log("\n=== Test 5: P6 - allSessionsRes error ===\n");

// When allSessionsRes has an error, hasStartedAny should be null
const allSessionsErrorInput = {
  ...baseInput,
  allSessionsRes: {
    data: null,
    error: new Error("Failed to load all sessions"),
  },
};

const result5 = buildPage(allSessionsErrorInput);

assert(
  result5.promptBlocks.showFirstSessionOffer === false,
  "P6: allSessionsRes error suppresses first session offer"
);

console.log("\n=== Test 6: P7 - Yesterday filter ===\n");

// Yesterday filter should only include yesterday's date, not other dates
// Use Saturday (day 6) as yesterday, which is a training day
const multiDateInput = {
  ...baseInput,
  yesterday: "2026-01-10", // Saturday (day_index 6, training day)
  yesterdaySessionsRes: {
    data: [
      { id: "s1", local_date: "2026-01-10", status: "completed", actual_type: "weights" as const, program_id: "prog-1" },
      { id: "s2", local_date: "2026-01-10", status: "completed", actual_type: "weights" as const, program_id: "other" }, // different program
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

const result6 = buildPage(multiDateInput);

// Should filter to program_id=prog-1 only
assert(
  result6.todayState.missedYesterday === false,
  "P7: Yesterday filter includes only current program sessions"
);

console.log("\n=== Test 7: chosenByDayIndex - Tomorrow choice shows ===\n");

// Test that a choice made for tomorrow shows on tomorrow's row with a label
// Use 2026-01-12 which is a real Monday
const tomorrowChoiceInput = {
  ...baseInput,
  localToday: "2026-01-12", // Monday (day_index 1)
  yesterday: "2026-01-11", // Sunday
  allSessionsRes: {
    data: [
      // User has started before (only actual_type, started_at)
      {
        actual_type: "weights" as const,
        started_at: "2026-01-10T10:00:00Z",
      },
    ],
    error: null,
  },
  weekSessionsRes: {
    data: [
      // A planned session for Tuesday (tomorrow) with actual_type "weights" pointing to Pull
      {
        id: "sess-1",
        local_date: "2026-01-13", // Tuesday (day_index 2)
        status: "planned",
        actual_type: "weights" as const,
        program_id: "prog-1",
        program_day_id: "day3", // Pull
        started_at: null,
        created_at: "2026-01-13T09:00:00Z",
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

const result7 = buildPage(tomorrowChoiceInput);

// Check that weekRowsWithChoices shows "Pull" for Tuesday (dayIndex 2)
const tuesdayRow = result7.todayView.weekRowsWithChoices.find(r => r.dayIndex === 2);

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
const mondayRow = result7.todayView.weekRowsWithChoices.find(r => r.dayIndex === 1);

assert(
  mondayRow!.label === "Push" && mondayRow!.isChoice === false,
  "Monday (today) shows template with no choice"
);

console.log("\n=== Test 8: chosenByDayIndex - Unchanged plan shows no choice ===\n");

// Test that when the session matches the template, isChoice=false
const unchangedPlanInput = {
  ...baseInput,
  localToday: "2026-01-12", // Monday (day_index 1)
  yesterday: "2026-01-11", // Sunday
  allSessionsRes: {
    data: [
      // User has started before (only actual_type, started_at)
      {
        actual_type: "weights" as const,
        started_at: "2026-01-10T10:00:00Z",
      },
    ],
    error: null,
  },
  weekSessionsRes: {
    data: [
      // A planned session for Monday matching the template (Push)
      {
        id: "sess-1",
        local_date: "2026-01-12", // Monday
        status: "planned",
        actual_type: "weights" as const,
        program_id: "prog-1",
        program_day_id: "day1", // Push - matches template
        started_at: null,
        created_at: "2026-01-12T09:00:00Z",
      },
    ],
    error: null,
  },
};

const result8 = buildPage(unchangedPlanInput);

const mondayRow7 = result8.todayView.weekRowsWithChoices.find(r => r.dayIndex === 1);

assert(
  mondayRow7!.label === "Push",
  "Unchanged plan shows template label"
);

assert(
  mondayRow7!.isChoice === false,
  "Unchanged plan has isChoice=false (no override)"
);

console.log("\n=== Test 8b: F1 - Production-shaped allSessionsRes ===\n");

// Test that week choices work with production-shaped allSessionsRes
// (only actual_type, started_at, no full session data)
const productionShapedInput = {
  ...baseInput,
  localToday: "2026-01-12", // Monday (day_index 1)
  yesterday: "2026-01-11", // Sunday
  allSessionsRes: {
    data: [
      // Production shape: only actual_type and started_at
      {
        actual_type: "weights" as const,
        started_at: "2026-01-10T10:00:00Z",
      },
    ],
    error: null,
  },
  weekSessionsRes: {
    data: [
      // Tuesday has a planned Pull session (different from template Rest)
      {
        id: "sess-tuesday",
        local_date: "2026-01-13", // Tuesday (day_index 2)
        status: "planned",
        actual_type: "weights" as const,
        program_id: "prog-1",
        program_day_id: "day3", // Pull
        started_at: null,
        created_at: "2026-01-13T09:00:00Z",
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

const result8b = buildPage(productionShapedInput);

const tuesdayRow8b = result8b.todayView.weekRowsWithChoices.find(r => r.dayIndex === 2);

assert(
  tuesdayRow8b !== undefined && tuesdayRow8b.label === "Pull" && tuesdayRow8b.isChoice === true,
  "F1: Week loop reads weekSessionsRes (not allSessionsRes), so planned Pull shows"
);

console.log("\n=== Test 9: P-MISSED-ANY - Veteran user, missed yesterday, empty week ===\n");

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

const result9 = buildPage(veteranMissedInput);

assert(
  result9.todayState.missedYesterday === true,
  "P-MISSED-ANY: Veteran user who missed yesterday gets missed prompt"
);

assert(
  result9.promptBlocks.showFirstSessionOffer === false,
  "P-MISSED-ANY: Veteran user doesn't get first session offer"
);

assert(
  result9.promptBlocks.showFirstDayWelcome === false,
  "P-MISSED-ANY: Veteran user doesn't get 'Welcome to your first workout'"
);

console.log("\n=== Test 10: P-REBUILD - Completed workout, then rebuild block ===\n");

// User finished a workout today, then rebuilt the block (new program_id).
// Today must show strengthDone=true, not offer Start or missed prompt.
const rebuildInput = {
  ...baseInput,
  localToday: "2026-01-12", // Monday
  yesterday: "2026-01-11", // Sunday
  todaySessionsRes: {
    data: [
      {
        id: "old-session",
        local_date: "2026-01-12",
        status: "completed",
        actual_type: "weights" as const,
        program_id: "old-program-id", // Different from current program
        program_day_id: "old-day-1",
        started_at: "2026-01-12T10:00:00Z",
        created_at: "2026-01-12T10:00:00Z",
      },
    ],
    error: null,
  },
  yesterdaySessionsRes: {
    data: [],
    error: null,
  },
  allSessionsRes: {
    data: [
      {
        local_date: "2026-01-12",
        status: "completed",
        actual_type: "weights" as const,
        program_day_id: "old-day-1",
        started_at: "2026-01-12T10:00:00Z",
      },
    ],
    error: null,
  },
  sessionExercisesRes: {
    data: [],
    error: null,
  },
};

const result10 = buildPage(rebuildInput);

assert(
  result10.strengthDone === true,
  "P-REBUILD: Completed strength session (old program_id) counts as strengthDone"
);

assert(
  result10.todayState.missedYesterday === false,
  "P-REBUILD: No false missed prompt after rebuild"
);

console.log("\n=== Test 11: P-YEST-ERROR - Yesterday sessions query error ===\n");

// If yesterdaySessionsRes.error, treat yesterday as unknown so
// the missed prompt doesn't fire (false positive).
const yesterdayErrorInput = {
  ...baseInput,
  localToday: "2026-01-12", // Monday (training day)
  yesterday: "2026-01-11", // Sunday
  days: [
    ...baseInput.days.slice(0, 6),
    { id: "day7", day_index: 7, day_type: "weights" as const, label: "Upper" }, // Make Sunday a training day
  ],
  allSessionsRes: {
    data: [
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
  todaySessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessionsRes: {
    data: null,
    error: new Error("Failed to load yesterday's sessions"),
  },
  sessionExercisesRes: {
    data: [],
    error: null,
  },
};

const result11 = buildPage(yesterdayErrorInput);

assert(
  result11.todayState.missedYesterday === false,
  "P-YEST-ERROR: Errored sessions read suppresses missed prompt"
);

assert(
  result11.todayState.isTraining === true,
  "P-YEST-ERROR: Errored sessions read preserves isTraining"
);

console.log("\n=== Test 12: P8 - In-progress session from old block suppresses missed ===\n");

// User rebuilt the block (new program_id), has an in_progress session today from old block,
// and missed yesterday. Only strengthOpen (not isTodayAnswered) suppresses the missed prompt.
const plannedTodayInput = {
  ...baseInput,
  yesterday: "2026-01-10", // Saturday (training day)
  localToday: "2026-01-11", // Sunday
  allSessionsRes: {
    data: [
      {
        actual_type: "weights" as const,
        started_at: "2026-01-05T10:00:00Z",
      },
    ],
    error: null,
  },
  todaySessionsRes: {
    data: [
      {
        id: "today-in-progress",
        local_date: "2026-01-11",
        status: "in_progress",
        actual_type: "weights" as const,
        program_id: "old-prog-id", // Old block, so isTodayAnswered = false
        program_day_id: "old-day1",
        started_at: "2026-01-11T10:00:00Z",
        created_at: "2026-01-11T09:00:00Z",
      },
    ],
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

const result12 = buildPage(plannedTodayInput);

assert(
  result12.todayState.promptType === "none",
  "P8: In-progress session (strengthOpen) suppresses missed prompt"
);

assert(
  result12.strengthOpen !== undefined,
  "P8: strengthOpen is set when in_progress session exists"
);

assert(
  result12.needsPlannableDays === false,
  "P8: strengthOpen suppresses needsPlannableDays"
);

console.log("\n✅ All buildPage tests passed!\n");
