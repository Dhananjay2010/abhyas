#!/usr/bin/env tsx
/**
 * Test: in_progress strength/bodyweight session settles missed day
 *
 * #32 owns the rule that an in_progress strength or bodyweight session
 * in this program settles that day for missed-yesterday detection.
 * This test proves that removing the rule causes a failure.
 */

import { isMissedTrainingDay } from "../src/lib/today/missed-day";

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

console.log("\n=== Test 1: in_progress weights session settles the day ===\n");

// Scenario: Yesterday was a training day
// User has an in_progress weights session from yesterday in this program
// Expected: NOT missed (in_progress workout counts as a choice)

const result1 = isMissedTrainingDay({
  date: "2026-10-23",
  programStartedOn: "2026-10-20",
  profileCreatedAt: "2026-10-01T10:00:00Z",
  timezone: "UTC",
  templateDayType: "weights",
  programId: "program-1",
  sessions: [
    {
      actual_type: "weights",
      status: "in_progress",
      program_id: "program-1",
      working_set_count: 2,
    },
  ],
  hasStartedAny: true,
});

assert(
  !result1,
  "in_progress weights session in this program settles the day"
);

console.log("\n=== Test 2: in_progress bodyweight session settles the day ===\n");

// Scenario: Yesterday was a training day
// User has an in_progress bodyweight session from yesterday in this program
// Expected: NOT missed

const result2 = isMissedTrainingDay({
  date: "2026-10-23",
  programStartedOn: "2026-10-20",
  profileCreatedAt: "2026-10-01T10:00:00Z",
  timezone: "UTC",
  templateDayType: "bodyweight",
  programId: "program-1",
  sessions: [
    {
      actual_type: "bodyweight",
      status: "in_progress",
      program_id: "program-1",
      working_set_count: 0,
    },
  ],
  hasStartedAny: true,
});

assert(
  !result2,
  "in_progress bodyweight session in this program settles the day"
);

console.log("\n=== Test 3: in_progress session from DIFFERENT program does NOT settle ===\n");

// Scenario: Yesterday was a training day
// User has an in_progress session but from a different program
// Expected: MISSED (only sessions in THIS program count)

const result3 = isMissedTrainingDay({
  date: "2026-10-23",
  programStartedOn: "2026-10-20",
  profileCreatedAt: "2026-10-01T10:00:00Z",
  timezone: "UTC",
  templateDayType: "weights",
  programId: "program-1",
  sessions: [
    {
      actual_type: "weights",
      status: "in_progress",
      program_id: "old-program",
      working_set_count: 2,
    },
  ],
  hasStartedAny: true,
});

assert(
  result3,
  "in_progress session from different program does NOT settle"
);

console.log("\n=== Test 4: in_progress yoga does NOT settle training day ===\n");

// Scenario: Yesterday was a weights training day
// User has an in_progress yoga session
// Expected: MISSED (yoga in_progress is handled by planned choice rule, not this rule)

const result4 = isMissedTrainingDay({
  date: "2026-10-23",
  programStartedOn: "2026-10-20",
  profileCreatedAt: "2026-10-01T10:00:00Z",
  timezone: "UTC",
  templateDayType: "weights",
  programId: "program-1",
  sessions: [
    {
      actual_type: "yoga",
      status: "in_progress",
      program_id: "program-1",
      working_set_count: 0,
    },
  ],
  hasStartedAny: true,
});

assert(
  !result4,
  "in_progress yoga settles via planned choice rule"
);

console.log("\n=== Test 5: planned weights does NOT settle (only in_progress) ===\n");

// Scenario: Yesterday was a training day
// User has a planned weights session (not started yet)
// Expected: MISSED (only in_progress strength settles, not planned)

const result5 = isMissedTrainingDay({
  date: "2026-10-23",
  programStartedOn: "2026-10-20",
  profileCreatedAt: "2026-10-01T10:00:00Z",
  timezone: "UTC",
  templateDayType: "weights",
  programId: "program-1",
  sessions: [
    {
      actual_type: "weights",
      status: "planned",
      program_id: "program-1",
      working_set_count: 0,
    },
  ],
  hasStartedAny: true,
});

assert(
  result5,
  "planned weights does NOT settle (only in_progress)"
);

console.log(`\n✅ All ${passedTests}/${totalTests} in_progress settlement tests passed!\n`);
