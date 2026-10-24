#!/usr/bin/env tsx
/**
 * Test: Load failure guard for Today page
 *
 * Tests hasStartedAnyOrNull helper and buildTodayView's handling of null hasStartedAny.
 * These tests prove that breaks b1 and f1 are caught.
 */

import { hasStartedAnyOrNull } from "../src/lib/today/load-failure-guard";
import { buildTodayView } from "../src/lib/today/page-helpers";

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

console.log("\n=== Test 1: hasStartedAnyOrNull with successful query ===\n");

// Scenario: Query succeeded, user has started
const result1 = hasStartedAnyOrNull({
  data: [{ actual_type: "weights", started_at: "2026-10-22T10:00:00Z" }],
  error: null,
});

assert(
  result1 === true,
  "Query succeeded with session → returns true"
);

// Scenario: Query succeeded, user has not started
const result2 = hasStartedAnyOrNull({
  data: [],
  error: null,
});

assert(
  result2 === false,
  "Query succeeded with no sessions → returns false"
);

console.log("\n=== Test 2: hasStartedAnyOrNull with failed query (b1 break) ===\n");

// Scenario: Query failed
const result3 = hasStartedAnyOrNull({
  data: null,
  error: { message: "Network error" },
});

assert(
  result3 === null,
  "Query failed → returns null (not false)"
);

console.log("\n=== Test 3: buildTodayView with hasStartedAny=null (f1 break) ===\n");

// Scenario: hasStartedAny is null (query error), should hide first training day
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
  "hasStartedAny=null → firstTrainingDay is null (hide offer on error)"
);

console.log("\n=== Test 4: buildTodayView with hasStartedAny=false ===\n");

// Scenario: hasStartedAny is false (user never started), should show first training day
const viewWithNeverStarted = buildTodayView({
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
  hasStartedAny: false, // User never started
  chosenByDayIndex: new Map(),
});

assert(
  viewWithNeverStarted.firstTrainingDay !== null,
  "hasStartedAny=false → firstTrainingDay exists (show offer)"
);

assert(
  viewWithNeverStarted.firstTrainingDay?.dayIndex === 2,
  "hasStartedAny=false → firstTrainingDay is day 2 (first training day)"
);

console.log("\n=== Test 5: buildTodayView with hasStartedAny=true ===\n");

// Scenario: hasStartedAny is true (user has started), should hide first training day
const viewWithStarted = buildTodayView({
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
  hasStartedAny: true, // User has started
  chosenByDayIndex: new Map(),
});

assert(
  viewWithStarted.firstTrainingDay === null,
  "hasStartedAny=true → firstTrainingDay is null (hide offer)"
);

console.log(`\n✅ All ${passedTests}/${totalTests} load failure guard tests passed!\n`);
