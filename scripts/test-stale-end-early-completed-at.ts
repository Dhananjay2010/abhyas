#!/usr/bin/env tsx
/**
 * L-1 test: Stale end early uses stale-calculated completed_at, not now.
 *
 * Scenario: A stale session (started days ago) is ended early. The completed_at
 * timestamp should be set to the stale-calculated end time (last set + rest),
 * not the current wall-clock time.
 */

import { abandonSessionCore } from "../src/lib/session/abandon-session";
import type { AbandonSessionDeps } from "../src/lib/session/abandon-session-deps";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("# L-1: Stale end early uses stale completed_at");

(async () => {

// Test 1: Stale session - completed_at uses stale endedAt, not now
{
  const clock = {
    now: "2025-01-15T10:00:00Z",
    startedAt: "2025-01-10T08:00:00Z", // 5 days ago
    lastSetAt: "2025-01-10T08:10:00Z", // 10min after start
  };

  const updates: Array<{
    sessionId: string;
    patch: {
      status: string;
      completed_at: string | null;
      duration_seconds: number | null;
    };
  }> = [];

  const deps: AbandonSessionDeps = {
    async loadSessionMetadata() {
      return {
        data: {
          started_at: clock.startedAt,
          user_id: "u1",
        },
        error: null,
      };
    },
    async loadTimezone() {
      return { data: { timezone: "America/Los_Angeles" }, error: null };
    },
    async loadExercises() {
      return {
        data: [
          {
            session_sets: [
              { id: "set1", is_warmup_set: false },
            ],
          },
        ],
        error: null,
      };
    },
    async loadExercisesWithSets() {
      return {
        data: [
          {
            rest_seconds: 240, // 4min rest on exercise
            session_sets: [
              {
                id: "set1",
                is_warmup_set: false,
                completed_at: clock.lastSetAt,
              },
            ],
          },
        ],
        error: null,
      };
    },
    async updateSession(sessionId, patch) {
      updates.push({ sessionId, patch });
      return { error: null, updatedCount: 1 };
    },
    async loadSessionStatus() {
      return { data: { status: "in_progress" as const, duration_seconds: null }, error: null };
    },
    now: () => clock.now,
  };

  const result = await abandonSessionCore(deps, "s1", 18000);
  check("stale abandon result ok", result.ok);
  check("stale abandon update called once", updates.length === 1);

  if (updates.length > 0) {
    const patch = updates[0].patch;
    check("stale abandon status completed", patch.status === "completed");
    
    // completed_at should be stale endedAt (last set + rest), not now
    const expectedEndedAt = new Date(Date.parse(clock.lastSetAt) + 240 * 1000).toISOString();
    check("stale abandon completed_at is stale endedAt", patch.completed_at === expectedEndedAt,
      `got ${patch.completed_at}, want ${expectedEndedAt}`);
    check("stale abandon completed_at NOT now", patch.completed_at !== clock.now,
      `must not be ${clock.now}`);
    
    // duration should also be stale-capped
    check("stale abandon duration is stale-capped", patch.duration_seconds === 840,
      `got ${patch.duration_seconds}, want 840 (10min + 4min rest)`);
  }
}

// Test 2: Fresh session - completed_at uses now
{
  const clock = {
    now: "2025-01-15T10:00:00Z",
    startedAt: "2025-01-15T09:50:00Z", // 10min ago
  };

  const updates: Array<{
    sessionId: string;
    patch: {
      status: string;
      completed_at: string | null;
      duration_seconds: number | null;
    };
  }> = [];

  const deps: AbandonSessionDeps = {
    async loadSessionMetadata() {
      return {
        data: {
          started_at: clock.startedAt,
          user_id: "u1",
        },
        error: null,
      };
    },
    async loadTimezone() {
      return { data: { timezone: "America/Los_Angeles" }, error: null };
    },
    async loadExercises() {
      return {
        data: [
          {
            session_sets: [
              { id: "set1", is_warmup_set: false },
            ],
          },
        ],
        error: null,
      };
    },
    async loadExercisesWithSets() {
      return { data: [], error: null };
    },
    async updateSession(sessionId, patch) {
      updates.push({ sessionId, patch });
      return { error: null, updatedCount: 1 };
    },
    async loadSessionStatus() {
      return { data: { status: "in_progress" as const, duration_seconds: null }, error: null };
    },
    now: () => clock.now,
  };

  const result = await abandonSessionCore(deps, "s1", 600);
  check("fresh abandon result ok", result.ok);
  check("fresh abandon update called once", updates.length === 1);

  if (updates.length > 0) {
    const patch = updates[0].patch;
    check("fresh abandon status completed", patch.status === "completed");
    check("fresh abandon completed_at is now", patch.completed_at === clock.now,
      `got ${patch.completed_at}, want ${clock.now}`);
    check("fresh abandon duration is elapsed", patch.duration_seconds === 600);
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log("\n✅ All tests passed");

})().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
