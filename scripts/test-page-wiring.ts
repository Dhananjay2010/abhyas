/**
 * Test page-wiring helper: preserves error states (null values).
 * 
 * Covers:
 * - b1: failed load stays null, doesn't become false
 * - f1: offer not shown on failed load (hasStartedAny stays null)
 */

import { buildPageState } from "../src/lib/today/page-wiring";

const baseInput = {
  profile: {
    created_at: "2024-01-01T00:00:00Z",
    timezone: "America/New_York",
  },
  program: {
    id: "p1",
    started_on: "2024-01-01",
  },
  days: [
    { day_index: 1, day_type: "weights" as const, label: "Push" },
    { day_index: 2, day_type: "rest" as const, label: null },
  ],
  todaySessions: [],
  timezone: "America/New_York",
  localToday: "2024-01-15",
  yesterday: "2024-01-14",
  dayType: null,
  strengthDone: false,
  strengthOpen: false,
};

// Test 1: successful query - hasStartedAny is false
const successResult = buildPageState({
  ...baseInput,
  allSessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessions: [],
});

if (successResult.hasStartedAny !== false) {
  throw new Error(`Expected hasStartedAny = false, got ${successResult.hasStartedAny}`);
}

if (successResult.todayStateInput === null) {
  throw new Error("Expected non-null todayStateInput for successful query");
}

// Test 2: successful query - hasStartedAny is true
const hasStartedResult = buildPageState({
  ...baseInput,
  allSessionsRes: {
    data: [
      { actual_type: "weights", status: "completed", started_at: "2024-01-10T10:00:00Z" },
    ],
    error: null,
  },
  yesterdaySessions: [],
});

if (hasStartedResult.hasStartedAny !== true) {
  throw new Error(`Expected hasStartedAny = true, got ${hasStartedResult.hasStartedAny}`);
}

// Test 3: b1 - failed allSessions load - hasStartedAny stays null
const failedLoadResult = buildPageState({
  ...baseInput,
  allSessionsRes: {
    data: null,
    error: new Error("Database connection failed"),
  },
  yesterdaySessions: [],
});

if (failedLoadResult.hasStartedAny !== null) {
  throw new Error(`b1: failed load must preserve null, got ${failedLoadResult.hasStartedAny}`);
}

if (failedLoadResult.todayStateInput === null) {
  throw new Error("Expected non-null todayStateInput when only allSessions failed");
}

// Test 4: f1 - failed yesterday sessions - todayStateInput is null
const failedYesterdayResult = buildPageState({
  ...baseInput,
  allSessionsRes: {
    data: [],
    error: null,
  },
  yesterdaySessions: null, // Error state from attachWorkingSetCounts
});

if (failedYesterdayResult.todayStateInput !== null) {
  throw new Error("f1: failed yesterday query must return null todayStateInput");
}

if (failedYesterdayResult.hasStartedAny !== false) {
  throw new Error("hasStartedAny should still be computed even when yesterday failed");
}

// Test 5: both failed - hasStartedAny null, todayStateInput null
const bothFailedResult = buildPageState({
  ...baseInput,
  allSessionsRes: {
    data: null,
    error: new Error("Failed"),
  },
  yesterdaySessions: null,
});

if (bothFailedResult.hasStartedAny !== null) {
  throw new Error("Expected hasStartedAny = null when allSessions failed");
}

if (bothFailedResult.todayStateInput !== null) {
  throw new Error("Expected todayStateInput = null when yesterday failed");
}

console.log("✓ Test 1: successful query - hasStartedAny is false");
console.log("✓ Test 2: successful query - hasStartedAny is true");
console.log("✓ Test 3: b1 - failed allSessions load preserves null");
console.log("✓ Test 4: f1 - failed yesterday sessions returns null todayStateInput");
console.log("✓ Test 5: both failed - both null");
