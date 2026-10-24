#!/usr/bin/env tsx
/**
 * Mutation tests for finishTimestamp.
 *
 *   npx tsx scripts/test-finish-timestamp-mutations.ts
 */

import { finishTimestamp } from "../src/lib/session/finish-timestamp";

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

console.log("🧬 Testing finishTimestamp mutants\n");

// Mutant 1: Always return now (ignore staleness)
console.log("Mutant 1: Always return now");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z";
  const now = "2026-10-24T14:00:00Z"; // 24 hours later

  const result = finishTimestamp({
    startedAt,
    lastSetCompletedAt,
    now,
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: 90,
  });

  // Should use last set + buffer, NOT now
  const nowMs = new Date(now).getTime();
  const resultMs = result ? new Date(result).getTime() : null;

  assertTrue(resultMs !== nowMs, "Stale session must not use now");
  assertTrue(resultMs !== null && resultMs < nowMs, "Stale session uses earlier timestamp");
}

// Mutant 2: Ignore lastSetCompletedAt (always use now even when stale)
console.log("\nMutant 2: Ignore lastSetCompletedAt");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z";
  const now = "2026-10-24T14:00:00Z";

  const result = finishTimestamp({
    startedAt,
    lastSetCompletedAt,
    now,
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: 90,
  });

  // Mutant would return now
  // Correct implementation returns lastSet + buffer
  const expectedMs = new Date(lastSetCompletedAt).getTime() + 90000;
  const resultMs = result ? new Date(result).getTime() : null;

  assertTrue(resultMs === expectedMs, "Must use lastSetCompletedAt + buffer when stale");
}

// Mutant 3: Wrong staleness check (never consider stale)
console.log("\nMutant 3: Never consider sessions stale");
{
  // Past day session
  const result1 = finishTimestamp({
    startedAt: "2026-10-23T14:00:00Z",
    lastSetCompletedAt: "2026-10-23T14:25:00Z",
    now: "2026-10-24T14:00:00Z",
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: 90,
  });

  // Should NOT equal now
  assertTrue(result1 !== "2026-10-24T14:00:00Z", "Past-day session must be considered stale");

  // >3h session
  const result2 = finishTimestamp({
    startedAt: "2026-10-24T10:00:00Z",
    lastSetCompletedAt: "2026-10-24T10:25:00Z",
    now: "2026-10-24T14:00:00Z",
    timezone: "UTC",
    sessionLocalDate: "2026-10-24",
    plannedRestSeconds: 90,
  });

  assertTrue(result2 !== "2026-10-24T14:00:00Z", ">3h session must be considered stale");
}

// Mutant 4: Use wrong buffer (or no buffer)
console.log("\nMutant 4: Wrong or missing buffer");
{
  const lastSetCompletedAt = "2026-10-23T14:25:00Z";
  const result = finishTimestamp({
    startedAt: "2026-10-23T14:00:00Z",
    lastSetCompletedAt,
    now: "2026-10-24T14:00:00Z",
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: 90,
  });

  // Should be last set + 90s, not last set exactly
  const lastSetMs = new Date(lastSetCompletedAt).getTime();
  const resultMs = result ? new Date(result).getTime() : null;

  assertTrue(resultMs !== lastSetMs, "Must add buffer to last set time");
  assertTrue(resultMs === lastSetMs + 90000, "Must add exact planned rest as buffer");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All mutants caught!");
