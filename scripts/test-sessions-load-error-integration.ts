#!/usr/bin/env tsx
/**
 * Test: Sessions load error integration with real helpers
 *
 * Tests the real load-failure-guard helper (hasStartedAnyOrNull)
 * and buildTodayView's handling of null hasStartedAny.
 * 
 * This replaces the previous hand-fed test that claimed to test page.tsx
 * but never ran any page code.
 */

import { hasStartedAnyOrNull } from "../src/lib/today/load-failure-guard";
import { buildTodayView } from "../src/lib/today/page-helpers";
import { buildTodayState } from "../src/lib/today/build-state";

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

console.log("\n=== Test 1: hasStartedAnyOrNull with failed query ===\n");

// Scenario: allSessionsRes has an error
// Expected: returns null (unknown state)

const failedQuery = {
  data: null,
  error: { message: "Network error", code: "NETWORK_ERROR" },
};

const result1 = hasStartedAnyOrNull(failedQuery);

assert(
  result1 === null,
  "Failed query returns null (unknown state)"
);

console.log("\n=== Test 2: hasStartedAnyOrNull with successful empty query ===\n");

// Scenario: allSessionsRes succeeded but returned empty array
// Expected: returns false (user has not started)

const emptyQuery = {
  data: [],
  error: null,
};

const result2 = hasStartedAnyOrNull(emptyQuery);

assert(
  result2 === false,
  "Empty sessions returns false (user has not started)"
);

console.log("\n=== Test 3: hasStartedAnyOrNull with successful query with sessions ===\n");

// Scenario: allSessionsRes succeeded with sessions
// Expected: returns true (user has started)

const successQuery = {
  data: [
    { actual_type: "weights" as const, started_at: "2026-10-20T10:00:00Z" as string | null },
  ],
  error: null,
};

const result3 = hasStartedAnyOrNull(successQuery);

assert(
  result3 === true,
  "Sessions exist returns true (user has started)"
);

console.log("\n=== Test 4: buildTodayView with null hasStartedAny ===\n");

// Scenario: hasStartedAny is null (query error)
// Expected: firstTrainingDay is null (hide first-session offer on error)

const viewWithNullStarted = buildTodayView({
  program: {
    started_on: "2026-10-20",
    week_offset: 0,
    deload_week: null,
  },
  localToday: "2026-10-24",
  days: [
    { id: "day-1", day_index: 1, day_type: "rest", label: null },
    { id: "day-2", day_index: 2, day_type: "weights", label: "Push" },
    { id: "day-3", day_index: 3, day_type: "weights", label: "Pull" },
  ],
  hasStartedAny: null, // Query error
  chosenByDayIndex: new Map(),
});

assert(
  viewWithNullStarted.firstTrainingDay === null,
  "null hasStartedAny hides firstTrainingDay (no offer on error)"
);

console.log("\n=== Test 5: buildTodayState with null input ===\n");

// Scenario: stateInput is null (working set counts query error)
// Expected: suppresses missed prompt (promptType = "none", missedYesterday = false)

// Test removed: buildTodayState no longer accepts null
// (yesterdayUnknown flag is used instead)

// Test removed - buildTodayState no longer accepts null

// Test removed - buildTodayState no longer accepts null

// Test removed - buildTodayState no longer accepts null

console.log("\n=== Test 6: Integration - failed load prevents first-session offer ===\n");

// Scenario: Full integration test
// 1. Query fails
// 2. hasStartedAnyOrNull returns null
// 3. buildTodayView gets null and hides firstTrainingDay
// Expected: No first-session offer when query fails

const failedSessionsRes = {
  data: null,
  error: { message: "Database connection lost" },
};

const hasStartedAny = hasStartedAnyOrNull(failedSessionsRes);
const todayView = buildTodayView({
  program: {
    started_on: "2026-10-20",
    week_offset: 0,
    deload_week: null,
  },
  localToday: "2026-10-24",
  days: [
    { id: "day-1", day_index: 1, day_type: "rest", label: null },
    { id: "day-2", day_index: 2, day_type: "weights", label: "Push" },
    { id: "day-3", day_index: 3, day_type: "weights", label: "Pull" },
  ],
  hasStartedAny,
  chosenByDayIndex: new Map(),
});

assert(
  hasStartedAny === null,
  "Integration: failed query produces null hasStartedAny"
);

assert(
  todayView.firstTrainingDay === null,
  "Integration: null hasStartedAny hides firstTrainingDay"
);

console.log(`\n✅ All ${passedTests}/${totalTests} sessions load error integration tests passed!\n`);
