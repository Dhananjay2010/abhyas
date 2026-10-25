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

import { resolveStaleFinishExtended } from "../src/lib/session/stale-duration";

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
  const result = resolveStaleFinishExtended({
    startedAt: "2026-10-24T10:00:00Z",
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 3,
    restSeconds: 120,
  });

  check("Status is completed", result.status === "completed");
  check("Duration is a finite positive number", Number.isFinite(result.durationSeconds) && (result.durationSeconds ?? 0) > 0);
  check("endedAt is not null", result.endedAt !== null);
  check("endedAt is a valid ISO timestamp", result.endedAt !== null && !isNaN(Date.parse(result.endedAt)));
}

console.log("\n2. Invalid startedAt (null): returns null duration");
{
  const result = resolveStaleFinishExtended({
    startedAt: null,
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 3,
    restSeconds: 120,
  });

  check("Duration is null", result.durationSeconds === null);
  check("endedAt is null for invalid timestamp", result.endedAt === null);
}

console.log("\n3. Empty string startedAt: returns null duration");
{
  const result = resolveStaleFinishExtended({
    startedAt: "",
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 3,
    restSeconds: 180,
  });

  check("Duration is null", result.durationSeconds === null);
  check("endedAt is null for invalid timestamp", result.endedAt === null);
}

console.log("\n4. Invalid ISO string startedAt: returns null duration");
{
  const result = resolveStaleFinishExtended({
    startedAt: "not-a-date",
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 3,
    restSeconds: 120,
  });

  check("Duration is null", result.durationSeconds === null);
  check("endedAt is null for invalid timestamp", result.endedAt === null);
}

console.log("\n5. No sets (skipped): invalid startedAt still handled");
{
  const result = resolveStaleFinishExtended({
    startedAt: "not-a-date",
    lastSetCompletedAt: null,
    workingSetCount: 0,
  });

  check("Status is skipped", result.status === "skipped");
  check("Duration is null for invalid timestamp", result.durationSeconds === null);
  check("endedAt is null for invalid timestamp", result.endedAt === null);
}

console.log("\n6. Invalid startedAt with sets: doesn't measure from epoch (no-throw2)");
{
  const result = resolveStaleFinishExtended({
    startedAt: "not-a-date",
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 3,
    restSeconds: 120,
  });

  check("Status is completed", result.status === "completed");
  check("Duration is null (not ~56 years from epoch)", result.durationSeconds === null);
  check("endedAt is null for invalid timestamp", result.endedAt === null);
}

console.log("\n7. Null startedAt with sets: doesn't measure from epoch");
{
  const result = resolveStaleFinishExtended({
    startedAt: null,
    lastSetCompletedAt: "2026-10-24T10:30:00Z",
    workingSetCount: 3,
    restSeconds: 120,
  });

  check("Status is completed", result.status === "completed");
  check("Duration is null (not from epoch)", result.durationSeconds === null);
  check("endedAt is null for invalid timestamp", result.endedAt === null);
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All null/invalid startedAt tests passed!");
console.log("\nNote: If the function throws on invalid input, that's acceptable.");
console.log("The key requirement is: no NaN, no negative duration, no silent corruption.");
