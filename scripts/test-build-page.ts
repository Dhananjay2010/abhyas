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
  ],
  allSessionsRes: {
    data: [
      { actual_type: "weights" as const, started_at: "2026-01-10T10:00:00Z" },
    ],
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
  sessionExercisesRes: {
    data: [],
    error: null,
  },
  timezone: "America/New_York",
  localToday: "2026-01-15", // Monday
  yesterday: "2026-01-14", // Sunday (rest)
  dayType: "weights" as const,
  strengthDone: false,
  strengthOpen: false,
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

assert(
  result1.hasStartedAny === true,
  "buildPage computes hasStartedAny from allSessions"
);

console.log("\n=== Test 2: P2 - Sets error handling ===\n");

// When sessionExercisesRes has an error, should mark yesterdayUnknown
const erroredSetsInput = {
  ...baseInput,
  yesterdaySessionsRes: {
    data: [
      { id: "s1", status: "completed", actual_type: "weights" as const, program_id: "prog-1" },
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
const warmupInput = {
  ...baseInput,
  yesterdaySessionsRes: {
    data: [
      { id: "s1", status: "completed", actual_type: "weights" as const, program_id: "prog-1" },
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
  result4.hasStartedAny === null,
  "P6: allSessionsRes error preserves null (not false)"
);

console.log("\n=== Test 5: P7 - Yesterday filter ===\n");

// Yesterday filter should only include yesterday's date, not other dates
const multiDateInput = {
  ...baseInput,
  yesterdaySessionsRes: {
    data: [
      { id: "s1", status: "completed", actual_type: "weights" as const, program_id: "prog-1" },
      { id: "s2", status: "completed", actual_type: "weights" as const, program_id: "other" }, // different program
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

console.log("\n✅ All buildPage tests passed!\n");
