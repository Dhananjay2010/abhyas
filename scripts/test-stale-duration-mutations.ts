#!/usr/bin/env tsx
/**
 * Mutation tests for stale duration helpers.
 *
 *   npx tsx scripts/test-stale-duration-mutations.ts
 */

import { resolveStaleFinish } from "../src/lib/session/stale-duration";
import { isStaleSession } from "../src/lib/session/is-stale-session";

let passed = 0;
let failed = 0;

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

console.log("🧬 Testing stale duration mutants\n");

// Mutant 1: Return now in place of last set
console.log("Mutant 1: Return now instead of last set time");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 3,
  });

  // Mutant would use "now" (not available in input)
  // Correct implementation uses lastSetCompletedAt
  const resultMs = new Date(result.endedAt).getTime();
  const lastMs = new Date(lastSetCompletedAt).getTime();
  assertTrue(resultMs === lastMs, "Must use last set time, not now");
  assertTrue(result.durationSeconds === 1500, "Duration must be from start to last set");
}

// Mutant 2: Ignore workingSetCount (always mark completed)
console.log("\nMutant 2: Ignore workingSetCount");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-23T14:00:00Z",
    lastSetCompletedAt: "2026-10-23T14:25:00Z",
    workingSetCount: 0, // No working sets
  });

  // Correct implementation checks workingSetCount and returns skipped
  assertTrue(result.status === "skipped", "Must check workingSetCount");
  assertTrue(result.durationSeconds === 0, "0 working sets gives 0 duration");
}

// Mutant 3: Always mark as completed, ignore workingSetCount for status
console.log("\nMutant 3: Always completed, never skipped");
{
  const withSets = resolveStaleFinish({
    startedAt: "2026-10-23T14:00:00Z",
    lastSetCompletedAt: "2026-10-23T14:25:00Z",
    workingSetCount: 3,
  });

  const noSets = resolveStaleFinish({
    startedAt: "2026-10-23T14:00:00Z",
    lastSetCompletedAt: "2026-10-23T14:25:00Z",
    workingSetCount: 0,
  });

  assertTrue(withSets.status === "completed", "With sets is completed");
  assertTrue(noSets.status === "skipped", "Without sets is skipped");
  assertTrue(withSets.status !== noSets.status, "Status must differ based on workingSetCount");
}

// Mutant 4: Don't clamp last before start
console.log("\nMutant 4: Don't clamp last set before start");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T13:55:00Z"; // Before start

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 1,
  });

  // Must clamp to start (duration >= 0)
  assertTrue(result.durationSeconds >= 0, "Duration must not be negative");
  const resultMs = new Date(result.endedAt).getTime();
  const startMs = new Date(startedAt).getTime();
  assertTrue(resultMs === startMs, "Must clamp to start when last is before");
}

// Mutant 5: Use last + buffer instead of last exactly
console.log("\nMutant 5: Add buffer to last set time");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 2,
  });

  // Correct implementation uses last set time exactly, no buffer
  const resultMs = new Date(result.endedAt).getTime();
  const lastMs = new Date(lastSetCompletedAt).getTime();
  assertTrue(resultMs === lastMs, "Must use last set exactly (no buffer)");
  assertTrue(result.durationSeconds === 1500, "Duration is exactly start to last");
}

console.log("\n\n🧬 Testing isStaleSession mutants\n");

// Mutant 6: isStaleSession always false (never stale)
console.log("Mutant 6: Always return false (never stale)");
{
  const pastDay = isStaleSession({
    startedAt: "2026-10-23T14:00:00Z",
    now: "2026-10-24T14:00:00Z",
    timezone: "UTC",
  });

  const over3h = isStaleSession({
    startedAt: "2026-10-24T10:00:00Z",
    now: "2026-10-24T14:00:01Z",
    timezone: "UTC",
  });

  assertTrue(pastDay === true, "Past day must be stale");
  assertTrue(over3h === true, ">3h must be stale");
}

// Mutant 7: Check only time, ignore date boundary
console.log("\nMutant 7: Ignore date boundary, check only elapsed time");
{
  // Past day but <3h elapsed
  const result = isStaleSession({
    startedAt: "2026-10-23T23:30:00Z",
    now: "2026-10-24T00:30:00Z", // 1 hour later, but next day
    timezone: "UTC",
  });

  assertTrue(result === true, "Must check date boundary, not just elapsed time");
}

// Mutant 8: Wrong threshold (use 2h or 4h instead of 3h)
console.log("\nMutant 8: Wrong time threshold");
{
  const exactly3h = isStaleSession({
    startedAt: "2026-10-24T11:00:00Z",
    now: "2026-10-24T14:00:00Z",
    timezone: "UTC",
  });

  const just31h = isStaleSession({
    startedAt: "2026-10-24T11:00:00Z",
    now: "2026-10-24T14:00:01Z",
    timezone: "UTC",
  });

  assertTrue(exactly3h === false, "Exactly 3h is not stale");
  assertTrue(just31h === true, "Over 3h is stale");
  assertTrue(exactly3h !== just31h, "Must use exactly 3h threshold");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All mutants caught!");
