#!/usr/bin/env tsx
/**
 * MEDIUM-1 test: summaryDurationSeconds helper returns correct duration.
 *
 * Tests the pure helper that decides what duration to show in the finish summary:
 * - Stale sessions: use the saved duration from the backend (stale-capped)
 * - Fresh sessions: use the elapsed timer
 * - 6h boundary case
 */

import { summaryDurationSeconds } from "../src/lib/session/summary-duration";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("# MEDIUM-1: summaryDurationSeconds helper");

const clock = {
  nowMs: Date.parse("2025-01-15T10:00:00Z"),
};

// Test 1: Stale session - returns saved duration, not elapsed
{
  const startedAtMs = clock.nowMs - 5 * 3600 * 1000; // 5h ago
  const elapsed = Math.round((clock.nowMs - startedAtMs) / 1000); // ~18000s
  const saved = 555; // Backend stale-capped to 555s

  const result = summaryDurationSeconds({
    savedDurationSeconds: saved,
    elapsedSeconds: elapsed,
    isStale: true,
    nowMs: clock.nowMs,
  });

  check("stale session returns saved duration", result === saved, `got ${result}, want ${saved}`);
  check("stale session NOT elapsed", result !== elapsed, `must not be ${elapsed}`);
}

// Test 2: Fresh session - returns elapsed, not saved
{
  const startedAtMs = clock.nowMs - 600 * 1000; // 10min ago
  const elapsed = 600;
  const saved = 600; // Same as elapsed for fresh

  const result = summaryDurationSeconds({
    savedDurationSeconds: saved,
    elapsedSeconds: elapsed,
    isStale: false,
    nowMs: clock.nowMs,
  });

  check("fresh session returns elapsed", result === elapsed, `got ${result}, want ${elapsed}`);
}

// Test 3: Stale with null saved - falls back to elapsed
{
  const elapsed = 300;

  const result = summaryDurationSeconds({
    savedDurationSeconds: null,
    elapsedSeconds: elapsed,
    isStale: true,
    nowMs: clock.nowMs,
  });

  check("stale with null saved returns elapsed", result === elapsed, `got ${result}, want ${elapsed}`);
}

// Test 4: 6h boundary - returns saved stale duration
{
  const startedAtMs = clock.nowMs - 6 * 3600 * 1000; // 6h ago
  const elapsed = 21600;
  const saved = 21600; // max clamp

  const result = summaryDurationSeconds({
    savedDurationSeconds: saved,
    elapsedSeconds: elapsed,
    isStale: true,
    nowMs: clock.nowMs,
  });

  check("6h boundary returns saved", result === saved, `got ${result}, want ${saved}`);
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log("\n✅ All tests passed");
