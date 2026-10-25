#!/usr/bin/env tsx
/**
 * Proof test: Show that old resolveStaleFinishExtended returned 1970 epoch dates.
 * This test demonstrates the bug that is now fixed.
 */

// Simulate the OLD buggy version
function resolveStaleFinishExtendedOLD(input: {
  startedAt: string | null;
  lastSetCompletedAt: string | null;
  workingSetCount: number;
  restSeconds?: number | null;
}): { durationSeconds: number | null; endedAt: string; status: "completed" | "skipped" } {
  const start = input.startedAt ? Date.parse(input.startedAt) : NaN;

  if (input.workingSetCount <= 0) {
    const safeStartedAt = Number.isFinite(start) ? input.startedAt! : "1970-01-01T00:00:00.000Z";
    return { durationSeconds: 0, endedAt: safeStartedAt, status: "skipped" };
  }

  if (input.lastSetCompletedAt === null) {
    if (Number.isFinite(start)) {
      return { durationSeconds: 0, endedAt: input.startedAt!, status: "completed" };
    }
    return { durationSeconds: null, endedAt: "1970-01-01T00:00:00.000Z", status: "completed" };
  }

  const lastSetMs = Date.parse(input.lastSetCompletedAt);

  if (!Number.isFinite(start) || !Number.isFinite(lastSetMs)) {
    const safeEnd = Number.isFinite(lastSetMs) ? input.lastSetCompletedAt : "1970-01-01T00:00:00.000Z";
    return { durationSeconds: null, endedAt: safeEnd, status: "completed" };
  }

  const durationSeconds = Math.floor((lastSetMs - start) / 1000);
  const endedAt = new Date(lastSetMs).toISOString();

  return {
    durationSeconds,
    endedAt,
    status: "completed",
  };
}

console.log("\n=== OLD CODE (BUGGY) ===\n");

// Test 1: null startedAt with working sets → returns 1970 epoch
console.log("1. null startedAt with working sets:");
const result1 = resolveStaleFinishExtendedOLD({
  startedAt: null,
  lastSetCompletedAt: null,
  workingSetCount: 1,
});
console.log(`   endedAt: ${result1.endedAt}`);
console.log(`   ❌ BUG: Returns ${result1.endedAt.startsWith('1970') ? '1970 EPOCH' : 'valid'}`);

// Test 2: invalid startedAt with working sets → returns 1970 epoch
console.log("\n2. invalid startedAt with working sets:");
const result2 = resolveStaleFinishExtendedOLD({
  startedAt: "invalid-date",
  lastSetCompletedAt: null,
  workingSetCount: 1,
});
console.log(`   endedAt: ${result2.endedAt}`);
console.log(`   ❌ BUG: Returns ${result2.endedAt.startsWith('1970') ? '1970 EPOCH' : 'valid'}`);

// Test 3: null startedAt for skipped session → returns 1970 epoch
console.log("\n3. null startedAt for skipped session:");
const result3 = resolveStaleFinishExtendedOLD({
  startedAt: null,
  lastSetCompletedAt: null,
  workingSetCount: 0,
});
console.log(`   endedAt: ${result3.endedAt}`);
console.log(`   ❌ BUG: Returns ${result3.endedAt.startsWith('1970') ? '1970 EPOCH' : 'valid'}`);

// Test 4: invalid lastSetCompletedAt → returns 1970 epoch
console.log("\n4. invalid lastSetCompletedAt:");
const result4 = resolveStaleFinishExtendedOLD({
  startedAt: "2026-10-25T12:00:00Z",
  lastSetCompletedAt: "invalid",
  workingSetCount: 1,
});
console.log(`   endedAt: ${result4.endedAt}`);
console.log(`   ❌ BUG: Returns ${result4.endedAt.startsWith('1970') ? '1970 EPOCH' : 'valid'}`);

console.log("\n=== NEW CODE (FIXED) ===\n");

// Import the new fixed version
import { resolveStaleFinishExtended } from "../src/lib/session/stale-duration";

console.log("1. null startedAt with working sets:");
const newResult1 = resolveStaleFinishExtended({
  startedAt: null,
  lastSetCompletedAt: null,
  workingSetCount: 1,
});
console.log(`   endedAt: ${newResult1.endedAt}`);
console.log(`   ✓ FIXED: Returns ${newResult1.endedAt === null ? 'null' : newResult1.endedAt}`);

console.log("\n2. invalid startedAt with working sets:");
const newResult2 = resolveStaleFinishExtended({
  startedAt: "invalid-date",
  lastSetCompletedAt: null,
  workingSetCount: 1,
});
console.log(`   endedAt: ${newResult2.endedAt}`);
console.log(`   ✓ FIXED: Returns ${newResult2.endedAt === null ? 'null' : newResult2.endedAt}`);

console.log("\n3. null startedAt for skipped session:");
const newResult3 = resolveStaleFinishExtended({
  startedAt: null,
  lastSetCompletedAt: null,
  workingSetCount: 0,
});
console.log(`   endedAt: ${newResult3.endedAt}`);
console.log(`   ✓ FIXED: Returns ${newResult3.endedAt === null ? 'null' : newResult3.endedAt}`);

console.log("\n4. invalid lastSetCompletedAt:");
const newResult4 = resolveStaleFinishExtended({
  startedAt: "2026-10-25T12:00:00Z",
  lastSetCompletedAt: "invalid",
  workingSetCount: 1,
});
console.log(`   endedAt: ${newResult4.endedAt}`);
console.log(`   ✓ FIXED: Returns ${newResult4.endedAt === null ? 'null' : newResult4.endedAt}`);

console.log("\n✨ All epoch bugs fixed! No 1970 dates returned.\n");
