#!/usr/bin/env tsx
/**
 * Test that invalid timestamps (null, empty, non-ISO) never produce 1970 epoch dates.
 * 
 * (a) resolveStaleFinishExtended with invalid startedAt and working sets returns null timestamps
 * (b) finishSessionCore with null started_at and working sets returns error and makes no update
 */

import { resolveStaleFinishExtended } from "../src/lib/session/stale-duration";
import { finishSessionCore } from "../src/lib/session/finish-session";
import type { FinishSessionDeps } from "../src/lib/session/finish-session-deps";

let passed = 0;
let failed = 0;

function check(message: string, condition: boolean) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

console.log("\n🧪 Testing 1970 epoch protection\n");

// Test (a): resolveStaleFinishExtended with invalid startedAt
console.log("(a) resolveStaleFinishExtended with invalid startedAt and working sets");

// Case 1: null startedAt
{
  const result = resolveStaleFinishExtended({
    startedAt: null,
    lastSetCompletedAt: null,
    workingSetCount: 1,
  });
  check("null startedAt → endedAt is null", result.endedAt === null);
  check("null startedAt → durationSeconds is null", result.durationSeconds === null);
}

// Case 2: empty string startedAt
{
  const result = resolveStaleFinishExtended({
    startedAt: "",
    lastSetCompletedAt: null,
    workingSetCount: 1,
  });
  check("empty startedAt → endedAt is null", result.endedAt === null);
  check("empty startedAt → durationSeconds is null", result.durationSeconds === null);
}

// Case 3: invalid date string startedAt
{
  const result = resolveStaleFinishExtended({
    startedAt: "not-a-date",
    lastSetCompletedAt: null,
    workingSetCount: 1,
  });
  check("invalid startedAt → endedAt is null", result.endedAt === null);
  check("invalid startedAt → durationSeconds is null", result.durationSeconds === null);
}

// Test (b): finishSessionCore with null started_at and working sets
console.log("\n(b) finishSessionCore with null started_at and working sets");

type Call = { method: string; patch?: Record<string, unknown> };

function makeFakeDeps(startedAt: string | null): FinishSessionDeps & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async loadSession() {
      return {
        data: {
          started_at: startedAt,
          local_date: "2026-10-24",
          user_id: "user-123",
        },
        error: null,
      };
    },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
    async loadExercises() {
      return {
        data: [
          {
            rest_seconds: 90,
            session_sets: [{ id: "1", is_warmup_set: false, completed_at: null }],
          },
        ],
        error: null,
      };
    },
    async updateSession(_id: string, patch: Record<string, unknown>) {
      calls.push({ method: "update", patch });
      return { error: null, updatedCount: 1 };
    },
    async loadSessionStatus() {
      return { data: { status: "in_progress" as const }, error: null };
    },
    async loadExercisesForUpdate() {
      return { data: [], error: null };
    },
    async updateExerciseStatus() {
      return { error: null };
    },
    now: () => "2026-10-25T12:00:00Z",
  };
}

// Case 1: null started_at with working sets
{
  const deps = makeFakeDeps(null);
  const result = await finishSessionCore(deps, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });
  
  check("null started_at → returns ok:false", result.ok === false);
  if (!result.ok) {
    check("null started_at → error mentions invalid timestamps", result.error.includes("invalid timestamps"));
  }
  check("null started_at → no update call made", deps.calls.length === 0);
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All 1970 epoch protection tests passed!\n");
