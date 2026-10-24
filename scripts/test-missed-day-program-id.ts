#!/usr/bin/env tsx
/**
 * Test m7: Session from another program_id doesn't settle a missed day.
 * 
 * Verifies missed-day detection respects program_id when checking if
 * a day's workout was completed.
 */

import { isMissedTrainingDay } from "../src/lib/today/missed-day";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

console.log("=== Test m7: Session from other program doesn't settle missed day ===\n");

const programId = "prog-123";
const otherProgramId = "prog-456";

// Yesterday was a training day, user completed a session BUT in a different program
const result = isMissedTrainingDay({
  date: "2026-10-23",
  programStartedOn: "2026-10-20",
  profileCreatedAt: "2026-10-19T12:00:00Z",
  timezone: "America/New_York",
  templateDayType: "weights",
  programId,
  sessions: [
    {
      actual_type: "weights",
      status: "completed",
      program_id: otherProgramId, // Different program!
      working_set_count: 3,
    },
  ],
  hasStartedAny: true,
});

assert(result === true, "Day is missed even though completed session exists (wrong program_id)");

// Same scenario but with correct program_id
const resultSameProgram = isMissedTrainingDay({
  date: "2026-10-23",
  programStartedOn: "2026-10-20",
  profileCreatedAt: "2026-10-19T12:00:00Z",
  timezone: "America/New_York",
  templateDayType: "weights",
  programId,
  sessions: [
    {
      actual_type: "weights",
      status: "completed",
      program_id: programId, // Same program
      working_set_count: 3,
    },
  ],
  hasStartedAny: true,
});

assert(resultSameProgram === false, "Day is NOT missed when session from same program");

// Test with null program_id (anytime breathing)
const resultNullProgram = isMissedTrainingDay({
  date: "2026-10-23",
  programStartedOn: "2026-10-20",
  profileCreatedAt: "2026-10-19T12:00:00Z",
  timezone: "America/New_York",
  templateDayType: "weights",
  programId,
  sessions: [
    {
      actual_type: "meditation",
      status: "completed",
      program_id: null, // Anytime activity
      working_set_count: undefined,
    },
  ],
  hasStartedAny: true,
});

assert(resultNullProgram === true, "Anytime activity doesn't settle missed workout day");

console.log("\n✅ m7 test passed: program_id filtering works\n");
