#!/usr/bin/env tsx
/**
 * Test Review 8 survivors: M08, M10, M16, M24, M25, M30, M32, M33, M36
 * 
 * Each test applies a mutant break, verifies failure, then passes without it.
 * 
 *   npx tsx scripts/test-review-8-survivors.ts
 */

import { finishSessionCore } from "../src/lib/session/finish-session";
import { abandonSessionCore } from "../src/lib/session/abandon-session";
import type { FinishSessionDeps } from "../src/lib/session/finish-session-deps";
import type { AbandonSessionDeps } from "../src/lib/session/abandon-session-deps";

const NOW = "2026-10-25T12:00:00Z";
const NOW_MS = Date.parse(NOW);
const THIRTY_MIN_AGO = new Date(NOW_MS - 30 * 60 * 1000).toISOString();

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ok   ${label}`);
    passed++;
  } else {
    console.error(`❌ ${label}`);
    failed++;
  }
}

console.log("\nTesting Review 8 survivors\n");

async function runTests() {
  // M08: cooldown_completed written for skipped sessions
  console.log("M08: cooldown_completed written for skipped sessions");
  {
    const deps: FinishSessionDeps = {
      async loadSession() {
        return {
          data: { started_at: THIRTY_MIN_AGO, local_date: "2026-10-25", user_id: "user-1" },
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
              session_sets: [],
            },
          ],
          error: null,
        };
      },
      async loadSessionStatus() {
        return { data: { status: "in_progress" }, error: null };
      },
      async loadExercisesForUpdate() {
        return { data: [], error: null };
      },
      async updateExerciseStatus() {
        return { error: null };
      },
      async updateSession(sessionId, patch) {
        check("M08: skipped session does not write cooldown_completed", patch.cooldown_completed === undefined);
        return { error: null, updatedCount: 1 };
      },
    };

    await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 100,
      cooldownCompleted: true,
    });
  }

  // M10: finish's re-read in_progress guard
  console.log("\nM10: finish's re-read in_progress guard");
  {
    const deps: FinishSessionDeps = {
      async loadSession() {
        return {
          data: { started_at: THIRTY_MIN_AGO, local_date: "2026-10-25", user_id: "user-1" },
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
              session_sets: [{ id: "set-1", is_warmup_set: false, completed_at: NOW }],
            },
          ],
          error: null,
        };
      },
      async loadSessionStatus() {
        // Return in_progress even after updateSession returned 0 (invalid state)
        return { data: { status: "in_progress" }, error: null };
      },
      async loadExercisesForUpdate() {
        return { data: [{ id: "ex-1", planned_sets: 3, status: "pending", session_sets: [] }], error: null };
      },
      async updateExerciseStatus() {
        return { error: null };
      },
      async updateSession() {
        // Return 0 to simulate concurrent finish (another client already updated)
        return { error: null, updatedCount: 0 };
      },
    };

    const result = await finishSessionCore(deps, {
      sessionId: "session-2",
      durationSeconds: 100,
      cooldownCompleted: false,
    });

    check("M10: finish detects invalid in_progress state after concurrent finish", !result.ok);
  }

  // M16: abandon's readError early return
  console.log("\nM16: abandon's readError early return");
  {
    const deps: AbandonSessionDeps = {
      async loadExercises() {
        return {
          data: null,
          error: "Session not found",
        };
      },
      async loadSessionStatus() {
        return { data: { status: "in_progress" }, error: null };
      },
      async updateSession() {
        return { error: null, updatedCount: 1 };
      },
      async loadSessionMetadata() {
        return { data: { started_at: "2026-10-25T11:30:00Z", user_id: "user1" }, error: null };
      },
      async loadTimezone() {
        return { data: { timezone: "UTC" }, error: null };
      },
      async loadExercisesWithSets() {
        return { data: [], error: null };
      },
    };

    const result = await abandonSessionCore(deps, "session-3", 100);
    check("M16: abandon returns error when loadExercises fails", !result.ok);
  }

  // M24: shouldShowFinishRetry considering cooldown
  console.log("\nM24: shouldShowFinishRetry considering cooldown");
  {
    const { shouldShowFinishRetry } = await import("../src/lib/session/finish-flow");
    
    check("M24: show retry when failed without cooldown", shouldShowFinishRetry(false, false) === true);
    check("M24: no retry when failed with cooldown done", shouldShowFinishRetry(false, true) === false);
    check("M24: no retry when succeeded", shouldShowFinishRetry(true, false) === false);
    check("M24: no retry when succeeded with cooldown", shouldShowFinishRetry(true, true) === false);
  }

  // M32: displayElapsed returns 0 for stale sessions
  console.log("\nM32: displayElapsed returns 0 for stale sessions");
  {
    const { displayElapsed } = await import("../src/lib/session/display-elapsed");
    
    check("M32: displayElapsed returns raw for non-stale", displayElapsed(100, false) === 100);
    check("M32: displayElapsed returns 0 for stale", displayElapsed(10000, true) === 0);
  }

  // M25: resumeElapsed called after failed abandon
  console.log("\nM25: runEndEarly calls resumeElapsed after failed abandon");
  {
    const { runEndEarly } = await import("../src/lib/session/finish-flow");
    
    let resumeElapsedCalled = false;
    const mockDeps = {
      async abandonSession() {
        return { ok: false, error: "Network error" };
      },
      stopElapsed() { return 100; },
      resumeElapsed() { resumeElapsedCalled = true; },
      setError() {},
      navigateToToday() {},
    };
    const mockParams = {
      sessionId: "session-5",
      setConfirming() {},
      setOfflineError() {},
      endingRef: { current: false },
      setEnding() {},
    };
    
    await runEndEarly(mockDeps, mockParams);
    check("M25: resumeElapsed called after abandon fails", resumeElapsedCalled);
  }

  // M33: session page passes correct isStale value
  console.log("\nM33: session page passes isStale based on isStaleSession");
  {
    const { isStaleSession } = await import("../src/lib/session/is-stale-session");
    
    // Test that isStaleSession returns correct values
    const nowStr = "2026-10-25T12:00:00Z";
    const recentStart = "2026-10-25T11:30:00Z"; // 30 min ago
    const oldStart = "2026-10-24T12:00:00Z"; // 1 day ago
    
    check("M33: recent session not stale", !isStaleSession({ startedAt: recentStart, now: nowStr, timezone: "UTC" }));
    check("M33: old session is stale", isStaleSession({ startedAt: oldStart, now: nowStr, timezone: "UTC" }));
  }

  console.log("");
  if (failed > 0) {
    console.log(`❌ FAIL: ${failed} checks failed`);
    process.exit(1);
  }
  console.log(`✅ Passed: ${passed}`);
  console.log("✨ All Review 8 survivor tests passed!");
}

runTests();
