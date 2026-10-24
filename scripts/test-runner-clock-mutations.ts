#!/usr/bin/env tsx
/**
 * Mutation tests for runnerClockSeconds.
 *
 *   npx tsx scripts/test-runner-clock-mutations.ts
 */

import { runnerClockSeconds } from "../src/lib/session/runner-clock";

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

console.log("🧬 Testing runnerClockSeconds mutants\n");

// Mutant 1: Always return now - start (never cap for stale)
console.log("Mutant 1: Always return now - start");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z";
  const now = "2026-10-24T14:00:00Z"; // 24 hours later

  const result = runnerClockSeconds({
    startedAt,
    now,
    lastSetCompletedAt,
    workingSetCount: 3,
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: 90,
  });

  // Mutant would return 86400 (24 hours)
  // Correct implementation caps at last set + buffer
  assertTrue(result < 10800, "Stale session must cap display (< 3 hours)");
  assertTrue(result < 86400, "Must not show full 24 hours for past-day session");
}

// Mutant 2: Ignore lastSetCompletedAt (always count from start)
console.log("\nMutant 2: Ignore lastSetCompletedAt");
{
  const startedAt = "2026-10-24T10:00:00Z";
  const lastSetCompletedAt = "2026-10-24T10:20:00Z"; // 20 min after start
  const now = "2026-10-24T14:00:00Z"; // 4 hours later

  const result = runnerClockSeconds({
    startedAt,
    now,
    lastSetCompletedAt,
    workingSetCount: 2,
    timezone: "UTC",
    sessionLocalDate: "2026-10-24",
    plannedRestSeconds: 60,
  });

  // Should be capped at ~21 minutes, not 4 hours
  assertTrue(result < 2000, "Must use lastSetCompletedAt for cap");
  assertTrue(result > 1000, "Cap should include training duration");
}

// Mutant 3: Wrong staleness check (never cap)
console.log("\nMutant 3: Never cap (no staleness check)");
{
  const result = runnerClockSeconds({
    startedAt: "2026-10-23T14:00:00Z",
    now: "2026-10-24T14:00:00Z",
    lastSetCompletedAt: "2026-10-23T14:25:00Z",
    workingSetCount: 3,
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: 90,
  });

  // Must be capped, not 24 hours
  assertTrue(result < 86400, "Past-day must be recognized as stale");
  assertTrue(result < 10800, "Stale display must be capped");
}

// Mutant 4: Wrong cap calculation (no buffer)
console.log("\nMutant 4: Wrong cap (missing buffer)");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z"; // 25 min = 1500s
  const now = "2026-10-24T14:00:00Z";

  const result = runnerClockSeconds({
    startedAt,
    now,
    lastSetCompletedAt,
    workingSetCount: 3,
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: 90,
  });

  // Should be 1500 + 90 = 1590, not just 1500
  assertTrue(result > 1500, "Must add buffer to cap");
  assertTrue(result === 1590, "Cap must include exact buffer (90s)");
}

// Mutant 5: Use wrong time units (return milliseconds instead of seconds)
console.log("\nMutant 5: Wrong time units (milliseconds)");
{
  const startedAt = "2026-10-24T14:00:00Z";
  const now = "2026-10-24T14:30:00Z"; // 30 minutes
  const lastSetCompletedAt = "2026-10-24T14:25:00Z";

  const result = runnerClockSeconds({
    startedAt,
    now,
    lastSetCompletedAt,
    workingSetCount: 3,
    timezone: "UTC",
    sessionLocalDate: "2026-10-24",
    plannedRestSeconds: 90,
  });

  // Should be ~1800 seconds, not 1800000 milliseconds
  assertTrue(result < 100000, "Must return seconds, not milliseconds");
  assertTrue(result === 1800, "30 minutes = 1800 seconds");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All mutants caught!");
