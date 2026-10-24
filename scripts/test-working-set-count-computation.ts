#!/usr/bin/env tsx
/**
 * Test that working set counts are correctly computed from sets data
 * for missed-day detection in the Today page.
 * 
 * This test drives the real page-input path with rows shaped exactly like
 * page.tsx's select (sessions + sets data), verifying:
 * - A completed session with 1+ working sets means NOT missed
 * - A completed session with 0 working sets means missed
 */

import { countWorkingSets } from "../src/lib/session/count-sets";
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

const TEST_PROGRAM_ID = "program-1";

console.log("\n=== Test 1: countWorkingSets with warmup and working sets ===\n");

// Scenario: 2 warmup sets + 3 working sets with reps
const sets1 = [
  { is_warmup_set: true, reps: 5, duration_seconds: null },
  { is_warmup_set: true, reps: 8, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
];

assert(
  countWorkingSets(sets1) === 3,
  "countWorkingSets: 2 warmup + 3 working = 3 working sets"
);

console.log("\n=== Test 2: countWorkingSets with timed/isometric sets ===\n");

// Scenario: 1 warmup + 2 timed working sets
const sets2 = [
  { is_warmup_set: true, reps: null, duration_seconds: 30 },
  { is_warmup_set: false, reps: null, duration_seconds: 60 },
  { is_warmup_set: false, reps: null, duration_seconds: 60 },
];

assert(
  countWorkingSets(sets2) === 2,
  "countWorkingSets: 1 warmup + 2 timed working = 2 working sets"
);

console.log("\n=== Test 3: countWorkingSets with no working sets ===\n");

// Scenario: Only warmup sets (completed session with 0 working sets)
const sets3 = [
  { is_warmup_set: true, reps: 5, duration_seconds: null },
  { is_warmup_set: true, reps: 8, duration_seconds: null },
];

assert(
  countWorkingSets(sets3) === 0,
  "countWorkingSets: Only warmup sets = 0 working sets"
);

console.log("\n=== Test 4: Yesterday completed with 1+ working sets = NOT missed ===\n");

// Simulate page.tsx flow: yesterday was a training day with a completed session that has 1+ working sets
const yesterdayDate = "2026-10-22"; // Wed
const yesterdaySession = {
  id: "session-1",
  status: "completed",
  actual_type: "weights" as const,
  program_id: TEST_PROGRAM_ID,
  local_date: yesterdayDate,
};

// Sets data for this session (shaped like session_sets rows)
const yesterdaySets = [
  { is_warmup_set: true, reps: 5, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
];

// Compute working set count (this is what page.tsx does)
const workingSetCount1 = countWorkingSets(yesterdaySets);

assert(
  workingSetCount1 === 3,
  "Yesterday session has 3 working sets"
);

// Check if yesterday was missed (should be false)
const missed1 = isMissedTrainingDay({
  date: yesterdayDate,
  programStartedOn: "2026-10-20", // Mon (program start)
  profileCreatedAt: "2026-10-20T10:00:00Z",
  timezone: "UTC",
  templateDayType: "weights", // Wed = training day
  programId: TEST_PROGRAM_ID,
  sessions: [
    {
      status: yesterdaySession.status,
      actual_type: yesterdaySession.actual_type,
      program_id: yesterdaySession.program_id,
      working_set_count: workingSetCount1,
    },
  ],
  hasStartedAny: true,
});

assert(
  !missed1,
  "Yesterday with completed session (3 working sets) is NOT missed"
);

console.log("\n=== Test 5: Yesterday completed with 0 working sets = missed ===\n");

// Scenario: completed session but only warmup sets were logged (0 working sets)
const yesterdayDate2 = "2026-10-23"; // Thu
const yesterdaySession2 = {
  id: "session-2",
  status: "completed",
  actual_type: "weights" as const,
  program_id: TEST_PROGRAM_ID,
  local_date: yesterdayDate2,
};

// Sets data: only warmup sets
const yesterdaySets2 = [
  { is_warmup_set: true, reps: 5, duration_seconds: null },
  { is_warmup_set: true, reps: 8, duration_seconds: null },
];

// Compute working set count
const workingSetCount2 = countWorkingSets(yesterdaySets2);

assert(
  workingSetCount2 === 0,
  "Yesterday session has 0 working sets (warmup only)"
);

// Check if yesterday was missed (should be true)
const missed2 = isMissedTrainingDay({
  date: yesterdayDate2,
  programStartedOn: "2026-10-20", // Mon (program start)
  profileCreatedAt: "2026-10-20T10:00:00Z",
  timezone: "UTC",
  templateDayType: "weights", // Thu = training day
  programId: TEST_PROGRAM_ID,
  sessions: [
    {
      status: yesterdaySession2.status,
      actual_type: yesterdaySession2.actual_type,
      program_id: yesterdaySession2.program_id,
      working_set_count: workingSetCount2,
    },
  ],
  hasStartedAny: true,
});

assert(
  missed2,
  "Yesterday with completed session (0 working sets) IS missed"
);

console.log("\n=== Test 6: Mixed sets (reps + duration) ===\n");

// Scenario: Some sets with reps, some with duration
const sets6 = [
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: null, duration_seconds: 60 },
  { is_warmup_set: false, reps: 12, duration_seconds: null },
];

assert(
  countWorkingSets(sets6) === 3,
  "countWorkingSets: Mixed reps + duration = 3 working sets"
);

console.log("\n=== Test 7: Empty sets array ===\n");

const sets7: Array<{ is_warmup_set: boolean | null; reps: number | null; duration_seconds: number | null }> = [];

assert(
  countWorkingSets(sets7) === 0,
  "countWorkingSets: Empty array = 0 working sets"
);

console.log(`\n✅ All ${passedTests}/${totalTests} working set count computation tests passed!\n`);
