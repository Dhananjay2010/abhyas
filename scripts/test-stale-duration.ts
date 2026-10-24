/**
 * Test resolveStaleFinish helper (d).
 *
 * Verifies:
 * - workingSetCount > 0: status = 'completed', endedAt = lastSetCompletedAt, duration = end - start
 * - workingSetCount = 0: status = 'skipped', endedAt = startedAt, duration = 0
 * - lastSetCompletedAt = null with workingSetCount > 0: falls back to startedAt
 * - Duration is always non-negative (max(start, last))
 * - Duration never uses a capped 6-hour value (QA regression)
 *
 *   npx tsx scripts/test-stale-duration.ts
 */

import { resolveStaleFinish } from "../src/lib/session/stale-duration";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Working sets > 0 → completed, duration from last set");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-23T10:00:00.000Z",
    lastSetCompletedAt: "2026-10-23T10:45:30.000Z",
    workingSetCount: 3,
  });

  check("status is completed", result.status === "completed", result.status);
  check("endedAt is lastSetCompletedAt", result.endedAt === "2026-10-23T10:45:30.000Z", result.endedAt);
  check("duration is 2730 seconds (45.5 min)", result.durationSeconds === 2730, String(result.durationSeconds));
}

console.log("\n2. Zero working sets → skipped, 0 duration");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-23T11:00:00.000Z",
    lastSetCompletedAt: "2026-10-23T11:15:00.000Z",
    workingSetCount: 0,
  });

  check("status is skipped", result.status === "skipped", result.status);
  check("endedAt is startedAt", result.endedAt === "2026-10-23T11:00:00.000Z", result.endedAt);
  check("duration is 0", result.durationSeconds === 0, String(result.durationSeconds));
}

console.log("\n3. Working sets but no lastSetCompletedAt → falls back to start");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-23T12:00:00.000Z",
    lastSetCompletedAt: null,
    workingSetCount: 2,
  });

  check("status is completed", result.status === "completed", result.status);
  check("endedAt is startedAt", result.endedAt === "2026-10-23T12:00:00.000Z", result.endedAt);
  check("duration is 0 (same start/end)", result.durationSeconds === 0, String(result.durationSeconds));
}

console.log("\n4. Session with only warm-ups (workingSetCount = 0) → skipped");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-23T13:00:00.000Z",
    lastSetCompletedAt: "2026-10-23T13:20:00.000Z",
    workingSetCount: 0,
  });

  check("status is skipped", result.status === "skipped", result.status);
  check("duration is 0", result.durationSeconds === 0, String(result.durationSeconds));
}

console.log("\n5. Long past-day session (QA regression: never 6-hour cap)");
{
  // Session started yesterday morning, last set 8 hours later
  const result = resolveStaleFinish({
    startedAt: "2026-10-23T08:00:00.000Z",
    lastSetCompletedAt: "2026-10-23T16:00:00.000Z",
    workingSetCount: 5,
  });

  check("status is completed", result.status === "completed", result.status);
  check("duration is 28800 seconds (8 hours)", result.durationSeconds === 28800, String(result.durationSeconds));
  check("duration is NOT 21600 (6-hour cap)", result.durationSeconds !== 21600, String(result.durationSeconds));
}

console.log("\n6. Edge case: lastSetCompletedAt before startedAt (clock skew)");
{
  // Should never happen, but helper protects against negative duration
  const result = resolveStaleFinish({
    startedAt: "2026-10-23T15:00:00.000Z",
    lastSetCompletedAt: "2026-10-23T14:50:00.000Z",
    workingSetCount: 1,
  });

  check("status is completed", result.status === "completed", result.status);
  check("endedAt is startedAt (max used)", result.endedAt === "2026-10-23T15:00:00.000Z", result.endedAt);
  check("duration is 0 (non-negative)", result.durationSeconds === 0, String(result.durationSeconds));
}

console.log("\n7. Multiple working sets, last one logged 1 minute after start");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-24T09:00:00.000Z",
    lastSetCompletedAt: "2026-10-24T09:01:00.000Z",
    workingSetCount: 10,
  });

  check("status is completed", result.status === "completed", result.status);
  check("duration is 60 seconds", result.durationSeconds === 60, String(result.durationSeconds));
}

console.log("\n8. Millisecond precision in timestamps");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-24T10:00:00.123Z",
    lastSetCompletedAt: "2026-10-24T10:05:30.789Z",
    workingSetCount: 2,
  });

  check("status is completed", result.status === "completed", result.status);
  // Floor division: (330789 - 123) / 1000 = 330.666 → 330 seconds
  check("duration floors ms correctly", result.durationSeconds === 330, String(result.durationSeconds));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
