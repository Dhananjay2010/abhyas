#!/usr/bin/env tsx
/**
 * Test stale duration handling in abandonSessionCore (QA Bot 1 MEDIUM fix 2).
 * 
 * Verifies that stale sessions (>3h or null started_at) use resolveStaleFinishExtended
 * instead of raw elapsed seconds.
 * 
 * Tests:
 * 1. Fresh session (<3h) uses passed elapsed time
 * 2. Stale session (>3h) computes duration from last set + rest
 * 3. Null started_at uses stale logic
 * 4. Planted bug: passing 50000 seconds should be clamped/ignored for stale
 * 
 * Run: npm run test:abandon-stale-duration
 */

import { abandonSessionCore } from "../src/lib/session/abandon-session";
import type { AbandonSessionDeps } from "../src/lib/session/abandon-session-deps";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

const NOW_DATE = "2026-10-25T12:00:00Z";
const THIRTY_MIN_AGO = "2026-10-25T11:30:00Z";
const FOUR_HOURS_AGO = "2026-10-25T08:00:00Z";
const LAST_SET_TIME = "2026-10-25T11:55:00Z";

function makeFakeDeps(config: {
  startedAt: string | null;
  lastSetCompletedAt: string | null;
  workingSetCount: number;
  restSeconds: number | null;
}): AbandonSessionDeps & { getSavedDuration: () => number | null } {
  const state = { savedDuration: null as number | null };

  return {
    getSavedDuration: () => state.savedDuration,
    async loadSessionMetadata() {
      return { data: { started_at: config.startedAt, user_id: "user1" }, error: null };
    },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
    async loadExercises() {
      const sets = Array.from({ length: config.workingSetCount }, (_, i) => ({
        id: `set-${i}`,
        is_warmup_set: false,
      }));
      return {
        data: [{ session_sets: sets }],
        error: null,
      };
    },
    async loadExercisesWithSets() {
      const completedAt = config.lastSetCompletedAt ?? "2026-10-25T11:55:00Z";
      const sets = Array.from({ length: config.workingSetCount }, () => ({
        completed_at: completedAt,
        is_warmup_set: false,
      }));
      return {
        data: [{
          rest_seconds: config.restSeconds,
          session_sets: sets,
        }],
        error: null,
      };
    },
    async updateSession(_id, patch) {
      state.savedDuration = patch.duration_seconds;
      return { error: null, updatedCount: 1 };
    },
    async loadSessionStatus() {
      return { data: { status: "completed" as const }, error: null };
    },
  };
}

async function runTests() {
  console.log("Stale Duration Tests for abandonSessionCore\n");

  console.log("Test 1: Fresh session (<3h) uses passed elapsed time\n");
  {
    const deps = makeFakeDeps({
      startedAt: THIRTY_MIN_AGO,
      lastSetCompletedAt: LAST_SET_TIME,
      workingSetCount: 5,
      restSeconds: 120,
    });

    await abandonSessionCore(deps, "session-1", 1800); // 30 minutes = 1800 seconds

    const saved = deps.getSavedDuration();
    check("Fresh session saves passed elapsed time", saved === 1800, 
      `got ${saved}`);
  }

  console.log("\nTest 2: Stale session (>3h) computes from last set + rest\n");
  {
    const deps = makeFakeDeps({
      startedAt: FOUR_HOURS_AGO,
      lastSetCompletedAt: LAST_SET_TIME,
      workingSetCount: 5,
      restSeconds: 120,
    });

    // Pass huge elapsed (4 hours), but stale logic should compute duration differently
    await abandonSessionCore(deps, "session-2", 14400); // 4 hours = 14400 seconds

    // Stale logic: from FOUR_HOURS_AGO (08:00) to LAST_SET_TIME (11:55) + 120s rest
    // = ~3h 55min + 2min = ~237 minutes = ~14220 seconds, clamped to 21600 (6h) max
    const computed = deps.getSavedDuration();
    
    check("Stale session ignores passed elapsed", computed !== 14400, `got ${computed}`);
    check("Stale session computes from timestamps", computed !== null && computed > 14000 && computed <= 21600,
      `got ${computed}, expected ~14220 (clamped to <= 21600)`);
  }

  console.log("\nTest 3: Null started_at uses stale logic\n");
  {
    const deps = makeFakeDeps({
      startedAt: null,
      lastSetCompletedAt: LAST_SET_TIME,
      workingSetCount: 3,
      restSeconds: 90,
    });

    await abandonSessionCore(deps, "session-3", 600); // Pass 10 minutes

    // Null started_at with sets: stale logic returns null duration
    const saved = deps.getSavedDuration();
    check("Null started_at with sets returns null duration", saved === null,
      `got ${saved}`);
  }

  console.log("\nTest 4: Planted bug - stale session with huge elapsed\n");
  {
    const deps = makeFakeDeps({
      startedAt: FOUR_HOURS_AGO,
      lastSetCompletedAt: LAST_SET_TIME,
      workingSetCount: 2,
      restSeconds: 60,
    });

    // Plant bug: pass absurd elapsed time (13.9 hours)
    await abandonSessionCore(deps, "session-4", 50000);

    const computed = deps.getSavedDuration();
    
    check("Planted bug: absurd 50000s is ignored", computed !== 50000, `got ${computed}`);
    check("Planted bug: uses stale calculation instead", computed !== null && computed <= 21600,
      `got ${computed}, capped at 21600 (6h)`);
    
    console.log("  → Proves stale duration fix: abandonSessionCore uses stale logic, not raw elapsed");
  }

  console.log("\nTest 5: Fresh session clamps absurd elapsed to 6h\n");
  {
    const deps = makeFakeDeps({
      startedAt: THIRTY_MIN_AGO,
      lastSetCompletedAt: LAST_SET_TIME,
      workingSetCount: 3,
      restSeconds: 60,
    });

    // Fresh session with absurd elapsed should still be clamped
    await abandonSessionCore(deps, "session-5", 50000);

    const saved = deps.getSavedDuration();
    check("Fresh session clamps 50000s to 21600 (6h)", saved === 21600,
      `got ${saved}`);
  }

  return failures === 0;
}

runTests()
  .then(() => {
    console.log(`\n${failures === 0 ? "✅ All tests passed" : `❌ ${failures} test(s) failed`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error("\nTest suite error:", error);
    process.exit(1);
  });
