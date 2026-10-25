#!/usr/bin/env tsx
/**
 * Test: loadPage wiring layer
 * 
 * Tests that loadPage correctly assembles query results and passes them to buildPage.
 * Covers P1-P8 wiring tests from review.
 */

import { loadPage, type LoadPageInput } from "../src/lib/today/load-page";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

async function runTests() {
const baseInput: Omit<LoadPageInput, "fetchSessionExercises"> = {
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
  hasStartedAnyRes: {
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
  sessionsRes: {
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
  timezone: "America/New_York",
  localToday: "2026-01-12", // Monday
  yesterday: "2026-01-11", // Sunday
};

const mockFetcher = async (sessionIds: string[]) => ({
  data: [],
  error: null,
});

console.log("\n=== Test 1: P-LOADER-BASIC - Basic wiring ===\n");

const result1 = await loadPage({
  ...baseInput,
  fetchSessionExercises: mockFetcher,
});

assert(
  result1.todayView !== undefined,
  "P-LOADER-BASIC: loadPage returns todayView"
);

assert(
  result1.todayState !== undefined,
  "P-LOADER-BASIC: loadPage returns todayState"
);

console.log("\n=== Test 2: P-LOADER-ALL-TIME - All-time hasStartedAny passed ===\n");

// Veteran user with empty week window but old sessions in all-time query
const allTimeInput: typeof baseInput & { fetchSessionExercises: typeof mockFetcher } = {
  ...baseInput,
  hasStartedAnyRes: {
    data: [
      {
        local_date: "2026-01-03",
        status: "completed",
        actual_type: "weights" as const,
        program_day_id: "day1",
        started_at: "2026-01-03T10:00:00Z",
      },
    ],
    error: null,
  },
  sessionsRes: {
    data: [], // Empty week window
    error: null,
  },
  yesterday: "2026-01-10", // Training day (Saturday)
  days: [
    ...baseInput.days!.slice(0, 5),
    { id: "day6", day_index: 6, day_type: "weights" as const, label: "Upper" },
    { id: "day7", day_index: 7, day_type: "rest" as const, label: null },
  ],
  fetchSessionExercises: mockFetcher,
};

const result2 = await loadPage(allTimeInput);

assert(
  result2.promptBlocks.showFirstSessionOffer === false,
  "P-LOADER-ALL-TIME: Veteran user doesn't get first session offer"
);

assert(
  result2.todayState.missedYesterday === true,
  "P-LOADER-ALL-TIME: Missed yesterday detected with all-time sessions"
);

console.log("\n=== Test 3: P-LOADER-YEST-IDS - Yesterday IDs passed to fetcher ===\n");

let capturedIds: string[] = [];
const capturingFetcher = async (sessionIds: string[]) => {
  capturedIds = sessionIds;
  return { data: [], error: null };
};

const yesterdayIdsInput = {
  ...baseInput,
  sessionsRes: {
    data: [
      {
        id: "yest-1",
        local_date: baseInput.yesterday,
        status: "completed",
        actual_type: "weights" as const,
        program_id: "prog-1",
        program_day_id: "day1",
        started_at: "2026-01-11T10:00:00Z",
        created_at: "2026-01-11T10:00:00Z",
      },
      {
        id: "today-1",
        local_date: baseInput.localToday,
        status: "in_progress",
        actual_type: "weights" as const,
        program_id: "prog-1",
        program_day_id: "day1",
        started_at: "2026-01-12T10:00:00Z",
        created_at: "2026-01-12T10:00:00Z",
      },
    ],
    error: null,
  },
  fetchSessionExercises: capturingFetcher,
};

await loadPage(yesterdayIdsInput);

assert(
  capturedIds.length === 1 && capturedIds[0] === "yest-1",
  "P-LOADER-YEST-IDS: Only yesterday's session IDs passed to fetcher"
);

console.log("\n=== Test 4: P-LOADER-SETS-ERROR - Sets query error handled ===\n");

const setsErrorFetcher = async () => ({
  data: null,
  error: new Error("Failed to load sets"),
});

const result4 = await loadPage({
  ...baseInput,
  yesterday: "2026-01-10", // Training day
  days: [
    ...baseInput.days!.slice(0, 5),
    { id: "day6", day_index: 6, day_type: "weights" as const, label: "Upper" },
    { id: "day7", day_index: 7, day_type: "rest" as const, label: null },
  ],
  sessionsRes: {
    data: [
      {
        id: "yest-1",
        local_date: "2026-01-10",
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
  fetchSessionExercises: setsErrorFetcher,
});

assert(
  result4.todayState.missedYesterday === false,
  "P-LOADER-SETS-ERROR: Sets error suppresses missed prompt"
);

console.log("\n✅ All loadPage wiring tests passed!\n");
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
