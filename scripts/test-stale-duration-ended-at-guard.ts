#!/usr/bin/env tsx
/**
 * Test that resolveStaleFinish never returns ended_at earlier than lastSetCompletedAt.
 *
 * Regression test for mutant #8: if the guard `Math.max(lastSetMs, endedAtMs)` is
 * removed, edge cases like negative restSeconds or startedAt far in the future could
 * produce ended_at before the last set's completion time.
 *
 *   npx tsx scripts/test-stale-duration-ended-at-guard.ts
 */

import { resolveStaleFinish } from "../src/lib/session/stale-duration";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    failed++;
    console.error(`❌ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    passed++;
    console.log(`  ok   ${label}`);
  }
}

console.log("\n🧪 Testing resolveStaleFinish ended_at guard\n");

console.log("1. Normal case: ended_at = lastSet + rest (no guard needed)");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-24T10:00:00Z",
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 3,
    restSeconds: 120,
  });

  const lastSetMs = Date.parse("2026-10-24T10:30:00Z");
  const endedAtMs = Date.parse(result.endedAt);

  check("ended_at is not before lastSetCompletedAt", endedAtMs >= lastSetMs);
  check("ended_at is lastSet + 120s", endedAtMs === lastSetMs + 120000);
}

console.log("\n2. Negative restSeconds (clamped to 0): ended_at = lastSet");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-24T10:00:00Z",
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 3,
    restSeconds: -100,
  });

  const lastSetMs = Date.parse("2026-10-24T10:30:00Z");
  const endedAtMs = Date.parse(result.endedAt);

  check("ended_at is not before lastSetCompletedAt", endedAtMs >= lastSetMs);
  check("ended_at equals lastSet (rest clamped to 0)", endedAtMs === lastSetMs);
}

console.log("\n3. Edge case: startedAt after lastSet (time travel test)");
{
  // This shouldn't happen in real data, but if it does, guard must prevent
  // ended_at from being before lastSet
  const result = resolveStaleFinish({
    startedAt: "2026-10-24T11:00:00Z", // Started AFTER the set was logged
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 1,
    restSeconds: 60,
  });

  const lastSetMs = Date.parse("2026-10-24T10:30:00Z");
  const endedAtMs = Date.parse(result.endedAt);

  check("ended_at is not before lastSetCompletedAt", endedAtMs >= lastSetMs, `ended_at=${result.endedAt}, lastSet=2026-10-24T10:30:00Z`);
}

console.log("\n4. Huge negative rest (beyond clamp): still guarded");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-24T10:00:00Z",
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 2,
    restSeconds: -10000, // Way below 0
  });

  const lastSetMs = Date.parse("2026-10-24T10:30:00Z");
  const endedAtMs = Date.parse(result.endedAt);

  check("ended_at is not before lastSetCompletedAt", endedAtMs >= lastSetMs);
}

console.log("\n5. lastSet very late, startedAt very early: ended_at >= lastSet");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-24T08:00:00Z",
    lastSetCompletedAt: "2026-10-24T18:00:00Z", // 10 hours later
    workingSetCount: 1,
    restSeconds: 180,
  });

  const lastSetMs = Date.parse("2026-10-24T18:00:00Z");
  const endedAtMs = Date.parse(result.endedAt);

  check("ended_at is not before lastSetCompletedAt", endedAtMs >= lastSetMs);
  check("Duration is correctly large", result.durationSeconds > 36000, `Got ${result.durationSeconds} seconds`);
}

console.log("\n6. Zero rest seconds: ended_at = lastSet exactly");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-24T10:00:00Z",
    lastSetCompletedAt: "2026-10-24T10:45:00Z",
    workingSetCount: 5,
    restSeconds: 0,
  });

  const lastSetMs = Date.parse("2026-10-24T10:45:00Z");
  const endedAtMs = Date.parse(result.endedAt);

  check("ended_at equals lastSet (rest=0)", endedAtMs === lastSetMs);
  check("ended_at is not before lastSet", endedAtMs >= lastSetMs);
}

console.log("\n7. Max clamped rest (900 → 300): ended_at = lastSet + 300s");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-24T10:00:00Z",
    lastSetCompletedAt: "2026-10-24T10:20:00Z",
    workingSetCount: 1,
    restSeconds: 900, // Clamped to 300
  });

  const lastSetMs = Date.parse("2026-10-24T10:20:00Z");
  const endedAtMs = Date.parse(result.endedAt);

  check("ended_at is not before lastSetCompletedAt", endedAtMs >= lastSetMs);
  check("ended_at is lastSet + 300s (clamped)", endedAtMs === lastSetMs + 300000);
}

console.log(`\n${failed === 0 ? "✅" : "❌"} Passed: ${passed}, Failed: ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
