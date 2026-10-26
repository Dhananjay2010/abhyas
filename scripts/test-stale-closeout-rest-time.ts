#!/usr/bin/env tsx
/**
 * Test L-2: History close-out adds rest time consistently with runner finish.
 *
 * Validates that closeStaleSessionsCore uses resolveStaleFinishExtended with
 * rest_seconds to compute duration, matching the runner and abandon-session behavior.
 *
 * Chain 339:
 *   npx tsx scripts/test-stale-closeout-rest-time.ts
 */

import type { CloseStaleDeps, SessionExerciseRow } from "../src/lib/session/close-stale-deps";
import { closeStaleSessionsCore, type OpenSession } from "../src/lib/session/close-stale";

(async () => {
  let failures = 0;

  function check(label: string, ok: boolean, detail = "") {
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
  }

  // L-2: closeStaleSessionsCore uses rest_seconds to compute duration
  console.log("\nL-2: Close-out adds rest time (rest-time)");
  {
    const nowMs = Date.parse("2025-01-10T15:00:00Z"); // 7 hours after start
    const today = "2025-01-10";

    const openSessions: OpenSession[] = [
      {
        id: "session1",
        local_date: "2025-01-10",
        started_at: "2025-01-10T08:00:00Z",
        actual_type: "weights",
        status: "in_progress",
      },
    ];

    const rows: SessionExerciseRow[] = [
      {
        session_id: "session1",
        rest_seconds: 75,
        session_sets: [
          {
            id: "set1",
            is_warmup_set: false,
            completed_at: "2025-01-10T08:05:00Z", // 5 min after start, 6h55m ago
          },
        ],
      },
    ];

    let markedSessionId: string | null = null;
    let markedDuration: number | null = null;

    const deps: CloseStaleDeps = {
      fetchSessionExercises: async () => rows,
      markSessionDone: async (id, status, completedAt, durationSeconds) => {
        markedSessionId = id;
        markedDuration = durationSeconds;
        return true;
      },
      markPlannedSkipped: async () => {},
    };

    await closeStaleSessionsCore(deps, openSessions, nowMs, today);

    check("Session marked done", markedSessionId === "session1");
    // Duration should be 5 min (300s) + rest (75s) = 375s, then capped at 21600s
    const expectedDuration = 300 + 75;
    check("Duration includes rest time", markedDuration === expectedDuration, `got ${markedDuration}, expected ${expectedDuration}`);
  }

  if (failures > 0) {
    console.log(`\n❌ FAIL: ${failures} checks failed`);
    process.exit(1);
  }
  console.log("\n✨ All L-2 close-out rest time tests passed!");
})();
