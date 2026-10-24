#!/usr/bin/env tsx
/**
 * Test that resolveStaleFinish handles null/invalid startedAt safely.
 *
 * Regression test for regression #4: if null or invalid startedAt is passed,
 * Date.parse returns NaN, leading to NaN duration or negative values.
 * The function must fall back safely.
 *
 *   npx tsx scripts/test-stale-duration-null-started-at.ts
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

console.log("\n🧪 Testing resolveStaleFinish with null/invalid startedAt\n");

console.log("1. Valid startedAt: normal operation");
{
  const result = resolveStaleFinish({
    startedAt: "2026-10-24T10:00:00Z",
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 3,
    restSeconds: 120,
  });

  check("Status is completed", result.status === "completed");
  check("Duration is a finite positive number", Number.isFinite(result.durationSeconds) && result.durationSeconds > 0);
  check("endedAt is a valid ISO timestamp", !isNaN(Date.parse(result.endedAt)));
}

console.log("\n2. Invalid startedAt (null): falls back safely");
{
  try {
    const result = resolveStaleFinish({
      startedAt: null,
      lastSetCompletedAt: "2026-10-24T10:30:00Z",
      workingSetCount: 3,
      restSeconds: 120,
    });

    const isValidDuration = Number.isFinite(result.durationSeconds) && result.durationSeconds >= 0;
    check("Duration is not NaN and not negative", isValidDuration, `Got ${result.durationSeconds}`);
    check("endedAt is a valid ISO timestamp", !isNaN(Date.parse(result.endedAt)));
  } catch {
    // If it throws, that's also acceptable as a safety mechanism
    check("Function throws safely on null startedAt", true);
  }
}

console.log("\n3. Empty string startedAt: falls back safely");
{
  try {
    const result = resolveStaleFinish({
      startedAt: "",
      lastSetCompletedAt: "2026-10-24T10:30:00Z",
      workingSetCount: 3,
      restSeconds: 120,
    });

    const isValidDuration = Number.isFinite(result.durationSeconds) && result.durationSeconds >= 0;
    check("Duration is not NaN and not negative", isValidDuration, `Got ${result.durationSeconds}`);
    check("endedAt is a valid ISO timestamp", !isNaN(Date.parse(result.endedAt)));
  } catch {
    check("Function throws safely on empty startedAt", true);
  }
}

console.log("\n4. Invalid ISO string startedAt: falls back safely");
{
  try {
    const result = resolveStaleFinish({
      startedAt: "not-a-date",
      lastSetCompletedAt: "2026-10-24T10:30:00Z",
      workingSetCount: 3,
      restSeconds: 120,
    });

    const isValidDuration = Number.isFinite(result.durationSeconds) && result.durationSeconds >= 0;
    check("Duration is not NaN and not negative", isValidDuration, `Got ${result.durationSeconds}`);
    check("endedAt is a valid ISO timestamp", !isNaN(Date.parse(result.endedAt)));
  } catch {
    check("Function throws safely on invalid startedAt", true);
  }
}

console.log("\n5. No sets (skipped): invalid startedAt still handled");
{
  try {
    const result = resolveStaleFinish({
      startedAt: "not-a-date",
      lastSetCompletedAt: null,
      workingSetCount: 0,
    });

    check("Status is skipped", result.status === "skipped");
    check("Duration is 0", result.durationSeconds === 0);
    // For skipped, endedAt = startedAt, which might be invalid
    // The important part is no crash and duration is 0
  } catch {
    check("Function throws safely on invalid startedAt even when skipped", true);
  }
}

console.log("\n6. Invalid startedAt with sets: doesn't measure from epoch (no-throw2)");
{
  const result = resolveStaleFinish({
    startedAt: "not-a-date",
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 3,
    restSeconds: 120,
  });

  check("Status is completed", result.status === "completed");
  check("Duration is 0 (not ~56 years from epoch)", result.durationSeconds === 0);
  check("endedAt is valid", !isNaN(Date.parse(result.endedAt)));
}

console.log("\n7. Null startedAt with sets: doesn't measure from epoch");
{
  const result = resolveStaleFinish({
    startedAt: null,
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 3,
    restSeconds: 120,
  });

  check("Status is completed", result.status === "completed");
  check("Duration is 0 (not from epoch)", result.durationSeconds === 0);
  check("endedAt is valid", !isNaN(Date.parse(result.endedAt)));
}

console.log(`\n${failed === 0 ? "✅" : "❌"} Passed: ${passed}, Failed: ${failed}\n`);

if (failed > 0) {
  console.log("Note: If the function throws on invalid input, that's acceptable.");
  console.log("The key requirement is: no NaN, no negative duration, no silent corruption.");
}

process.exit(failed === 0 ? 0 : 1);
