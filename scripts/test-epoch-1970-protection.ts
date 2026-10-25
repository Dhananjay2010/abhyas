#!/usr/bin/env tsx
/**
 * Test that invalid timestamps (null, empty, non-ISO) never produce 1970 epoch dates.
 * 
 * Owner decision: finishing must never error because of a bad started_at.
 * A stale session with null/invalid started_at saves as COMPLETED with:
 * - completed_at = injected now (never 1970)
 * - duration_seconds = null
 * - Volume, sets, streak count as normal
 * 
 * (a) null started_at with working sets: ok:true, writes completed, completed_at=FIXED_NOW, duration=null
 * (b) invalid started_at ('', 'not-a-date'): same behavior
 * (c) 0 working sets: same result as main@5cc4022c
 * (d) no written value starts with '1970'
 * (e) resolveStaleFinishExtended results asserted directly
 */

import { resolveStaleFinishExtended } from "../src/lib/session/stale-duration";
import { finishSessionCore } from "../src/lib/session/finish-session";
import type { FinishSessionDeps } from "../src/lib/session/finish-session-deps";

const FIXED_NOW = "2026-10-25T12:00:00Z";

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

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log("\n🧪 Testing 1970 epoch protection (never error on bad started_at)\n");

// Test (e): resolveStaleFinishExtended returns null endedAt/duration for invalid timestamps
console.log("(e) resolveStaleFinishExtended with invalid startedAt and working sets");

// Case 1: null startedAt
{
  const result = resolveStaleFinishExtended({
    startedAt: null,
    lastSetCompletedAt: null,
    workingSetCount: 1,
  });
  check("null startedAt → endedAt is null", result.endedAt === null);
  check("null startedAt → durationSeconds is null", result.durationSeconds === null);
  check("null startedAt → status is completed", result.status === "completed");
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
  check("empty startedAt → status is completed", result.status === "completed");
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
  check("invalid startedAt → status is completed", result.status === "completed");
}

type Call = { method: string; patch?: Record<string, unknown> };

function makeFakeDeps(startedAt: string | null, workingSets: number): FinishSessionDeps & { calls: Call[] } {
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
      const sets = workingSets > 0
        ? [{ id: "1", is_warmup_set: false, completed_at: null }]
        : [];
      return {
        data: [
          {
            rest_seconds: 90,
            session_sets: sets,
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
    now: () => FIXED_NOW,
  };
}

// Test (a): null started_at with working sets
console.log("\n(a) finishSessionCore with null started_at and working sets");

(async () => {
  {
    const deps = makeFakeDeps(null, 1);
    const result = await finishSessionCore(deps, {
      sessionId: "s1",
      durationSeconds: 100,
      cooldownCompleted: true,
    });
    
    check("null started_at → returns ok:true", result.ok === true);
    check("null started_at → updateSession called once", deps.calls.length === 1);
    
    if (deps.calls.length > 0) {
      const update = deps.calls[0];
      assertEquals(update.patch?.status, "completed", "status is completed");
      assertEquals(update.patch?.completed_at, FIXED_NOW, "completed_at is FIXED_NOW (not 1970)");
      assertEquals(update.patch?.duration_seconds, null, "duration_seconds is null");
      
      // Check no 1970 in any written value
      const patchString = JSON.stringify(update.patch);
      check("no written value starts with 1970", !patchString.includes("1970"));
    }
  }

  // Test (b): invalid started_at with working sets
  console.log("\n(b) finishSessionCore with invalid started_at and working sets");
  
  // Empty string
  {
    const deps = makeFakeDeps("", 1);
    const result = await finishSessionCore(deps, {
      sessionId: "s1",
      durationSeconds: 100,
      cooldownCompleted: true,
    });
    
    check("empty started_at → returns ok:true", result.ok === true);
    check("empty started_at → updateSession called once", deps.calls.length === 1);
    
    if (deps.calls.length > 0) {
      const update = deps.calls[0];
      assertEquals(update.patch?.completed_at, FIXED_NOW, "completed_at is FIXED_NOW");
      assertEquals(update.patch?.duration_seconds, null, "duration_seconds is null");
    }
  }
  
  // Invalid date string
  {
    const deps = makeFakeDeps("not-a-date", 1);
    const result = await finishSessionCore(deps, {
      sessionId: "s1",
      durationSeconds: 100,
      cooldownCompleted: true,
    });
    
    check("'not-a-date' started_at → returns ok:true", result.ok === true);
    check("'not-a-date' started_at → updateSession called once", deps.calls.length === 1);
    
    if (deps.calls.length > 0) {
      const update = deps.calls[0];
      assertEquals(update.patch?.completed_at, FIXED_NOW, "completed_at is FIXED_NOW");
      assertEquals(update.patch?.duration_seconds, null, "duration_seconds is null");
    }
  }

  // Test (c): 0 working sets (same as main@5cc4022c)
  console.log("\n(c) finishSessionCore with 0 working sets (null started_at)");
  
  {
    const deps = makeFakeDeps(null, 0);
    const result = await finishSessionCore(deps, {
      sessionId: "s1",
      durationSeconds: 100,
      cooldownCompleted: true,
    });
    
    check("0 working sets → returns ok:true", result.ok === true);
    
    if (deps.calls.length > 0) {
      const update = deps.calls[0];
      assertEquals(update.patch?.status, "skipped", "status is skipped (same as main)");
      // Skipped sessions have null completed_at (not FIXED_NOW)
      assertEquals(update.patch?.completed_at, null, "completed_at is null (skipped)");
      // Duration is null (from resolveStaleFinishExtended)
      assertEquals(update.patch?.duration_seconds, null, "duration_seconds is null");
    }
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All 1970 epoch protection tests passed!\n");
})();

// Mutant tests: verify that the protection works by temporarily breaking it
console.log("\n🧪 Mutant tests: verifying epoch and error protections\n");

// Mutant 1: Re-introduce epoch fallback in resolveStaleFinishExtended
console.log("Mutant 1: Epoch fallback (should fail)\n");
console.log("To verify: edit stale-duration.ts line ~96, replace:");
console.log("  if (!Number.isFinite(start) || !Number.isFinite(lastSetMs)) {");
console.log("    return { durationSeconds: null, endedAt: null, status: \"completed\" };");
console.log("  }");
console.log("With:");
console.log("  // MUTANT: use epoch fallback instead of null");
console.log("  const safeStart = Number.isFinite(start) ? start : 0;");
console.log("  const safeLastSet = Number.isFinite(lastSetMs) ? lastSetMs : 0;");
console.log("\nThen run this test - it will FAIL with:");
console.log("  ❌ null started_at → endedAt is null");
console.log("  ❌ completed_at is FIXED_NOW (not 1970)");
console.log("\nRevert the mutation before continuing.");

// Mutant 2: Re-introduce error path
console.log("\nMutant 2: Error on invalid timestamps (should fail)\n");
console.log("To verify: edit finish-session.ts line ~92, replace:");
console.log("  if (staleFinish.endedAt === null) {");
console.log("    status = staleFinish.status;");
console.log("    endedAt = now;");
console.log("    durationSeconds = null;");
console.log("  }");
console.log("With:");
console.log("  // MUTANT: error instead of using now");
console.log("  if (staleFinish.endedAt === null) {");
console.log("    return { ok: false, error: \"Cannot finish session with invalid timestamps\" };");
console.log("  }");
console.log("\nThen run this test - it will FAIL with:");
console.log("  ❌ null started_at → returns ok:true");
console.log("\nRevert the mutation before continuing.");
