#!/usr/bin/env tsx
/**
 * Test keepPlannedRow: pure function that builds a Keep planned session row.
 *
 * Tests:
 * - Returns status 'planned'
 * - planned_type and actual_type both equal the template day_type
 * - program_day_id is set correctly
 * - is_deload is set correctly for deload week
 */

import { keepPlannedRow } from "../src/lib/session/keep-planned-row";

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

console.log("\n=== Test 1: Basic Keep row ===\n");

const row1 = keepPlannedRow({
  userId: "test-user-1",
  program: {
    id: "program-1",
    started_on: "2026-10-20", // Mon
    deload_week: 4,
  },
  programDay: {
    id: "day-1",
    day_type: "weights",
  },
  localDate: "2026-10-22", // Wed, week 1
});

assert(
  row1.status === "planned",
  "Status is 'planned'"
);

assert(
  row1.planned_type === "weights",
  "planned_type equals template day_type"
);

assert(
  row1.actual_type === "weights",
  "actual_type equals template day_type"
);

assert(
  row1.program_day_id === "day-1",
  "program_day_id is set correctly"
);

assert(
  row1.is_deload === false,
  "is_deload is false for week 1"
);

assert(
  row1.week_in_block === 1,
  "week_in_block is 1"
);

console.log("\n=== Test 2: Deload week Keep row ===\n");

const row2 = keepPlannedRow({
  userId: "test-user-2",
  program: {
    id: "program-2",
    started_on: "2026-10-20", // Mon
    deload_week: 4,
  },
  programDay: {
    id: "day-2",
    day_type: "bodyweight",
  },
  localDate: "2026-11-10", // Mon of week 4
});

assert(
  row2.status === "planned",
  "Deload row: status is 'planned'"
);

assert(
  row2.planned_type === "bodyweight",
  "Deload row: planned_type equals template day_type"
);

assert(
  row2.actual_type === "bodyweight",
  "Deload row: actual_type equals template day_type"
);

assert(
  row2.is_deload === true,
  "Deload row: is_deload is true for week 4"
);

assert(
  row2.week_in_block === 4,
  "Deload row: week_in_block is 4"
);

console.log("\n=== Test 3: All fields required ===\n");

// Test that all returned fields are present
const row3 = keepPlannedRow({
  userId: "test-user-3",
  program: {
    id: "program-3",
    started_on: "2026-10-20",
    deload_week: null,
  },
  programDay: {
    id: "day-3",
    day_type: "rest",
  },
  localDate: "2026-10-25",
});

assert(
  typeof row3.user_id === "string" && row3.user_id === "test-user-3",
  "user_id is set"
);

assert(
  typeof row3.program_id === "string" && row3.program_id === "program-3",
  "program_id is set"
);

assert(
  typeof row3.program_day_id === "string" && row3.program_day_id === "day-3",
  "program_day_id is set"
);

assert(
  typeof row3.local_date === "string" && row3.local_date === "2026-10-25",
  "local_date is set"
);

assert(
  row3.week_in_block !== undefined,
  "week_in_block is set"
);

assert(
  typeof row3.is_deload === "boolean",
  "is_deload is set"
);

assert(
  row3.status === "planned",
  "status is 'planned'"
);

assert(
  row3.actual_type !== undefined && row3.actual_type !== null,
  "actual_type is set"
);

assert(
  row3.planned_type !== undefined && row3.planned_type !== null,
  "planned_type is set"
);

console.log("\n==================================================");
console.log(`📊 Test Results: ${passedTests}/${totalTests} passed`);

if (passedTests === totalTests) {
  console.log("✅ All tests passed!");
  process.exit(0);
} else {
  console.log(`❌ ${totalTests - passedTests} test(s) failed`);
  process.exit(1);
}
