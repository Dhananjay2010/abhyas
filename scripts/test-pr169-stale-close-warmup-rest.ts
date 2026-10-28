#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up LOW-1: stale close uses last WORKING set's rest when
 * the last set overall is a warm-up.
 * 
 * Verifies that when the chronologically last set is a warm-up, the session
 * end uses the rest from the last WORKING set's exercise, not the warm-up's.
 * 
 * Same clamp 0-300 s and null = 300 s as main, matching History.
 * 
 *   npx tsx scripts/test-pr169-stale-close-warmup-rest.ts
 */

import { closeStaleSessionsCore, type OpenSession } from "../src/lib/session/close-stale";
import type { CloseStaleDeps, SessionExerciseRow } from "../src/lib/session/close-stale-deps";

const TODAY = "2026-10-28";
const SESSION_ID = "sess-test";
const NOW_MS = new Date("2026-10-28T12:00:00.000Z").getTime();

let passed = 0;
let failed = 0;

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

type MockSession = {
  id: string;
  status: string;
  completed_at: string | null;
  duration_seconds: number | null;
};

let mockSession: MockSession = {
  id: SESSION_ID,
  status: "in_progress",
  completed_at: null,
  duration_seconds: null,
};

function createDeps(rows: SessionExerciseRow[]): CloseStaleDeps {
  return {
    fetchSessionExercises: async () => rows,
    markSessionDone: async (id: string, status: "completed" | "skipped", completedAt: string, durationSeconds: number | null) => {
      mockSession = {
        id,
        status,
        completed_at: completedAt,
        duration_seconds: durationSeconds,
      };
      return true;
    },
    markPlannedSkipped: async () => {},
  };
}

(async function main() {
  console.log("\nPR #169 follow-up LOW-1: stale close with warm-up uses working set rest\n");

  console.log("Case 1: Last set is a warm-up (rest 90), last working set has rest 120");
  {
    mockSession = {
      id: SESSION_ID,
      status: "in_progress",
      completed_at: null,
      duration_seconds: null,
    };

    const rows: SessionExerciseRow[] = [
      {
        session_id: SESSION_ID,
        rest_seconds: 120,
        session_sets: [
          {
            id: "set-1",
            is_warmup_set: false,
            completed_at: "2026-10-28T03:30:00.000Z",
          },
          {
            id: "set-2",
            is_warmup_set: false,
            completed_at: "2026-10-28T03:32:00.000Z",
          },
        ],
      },
      {
        session_id: SESSION_ID,
        rest_seconds: 90,
        session_sets: [
          {
            id: "set-3",
            is_warmup_set: true,
            completed_at: "2026-10-28T03:45:00.000Z",
          },
        ],
      },
    ];

    const open: OpenSession[] = [
      {
        id: SESSION_ID,
        status: "in_progress",
        local_date: "2026-10-28",
        actual_type: "weights",
        started_at: "2026-10-28T03:00:00.000Z",
      },
    ];

    const deps = createDeps(rows);
    const credited = await closeStaleSessionsCore(deps, open, NOW_MS, TODAY);

    assertEquals(credited, 1, "one session credited as completed");
    assertEquals(mockSession.status, "completed", "session status is completed");
    
    // Should use rest 120 from last working set, not 90 from warm-up
    // Last set at 03:45:00, rest 120 seconds = end at 03:47:00
    // Duration: 03:00:00 to 03:47:00 = 2820 seconds
    assertEquals(mockSession.completed_at, "2026-10-28T03:47:00.000Z", "uses last working set rest (120s)");
    assertEquals(mockSession.duration_seconds, 2820, "duration includes working set rest");
  }

  console.log("\nCase 2: Last set is working (rest 90), should use it");
  {
    mockSession = {
      id: SESSION_ID,
      status: "in_progress",
      completed_at: null,
      duration_seconds: null,
    };

    const rows: SessionExerciseRow[] = [
      {
        session_id: SESSION_ID,
        rest_seconds: 120,
        session_sets: [
          {
            id: "set-1",
            is_warmup_set: true,
            completed_at: "2026-10-28T03:30:00.000Z",
          },
        ],
      },
      {
        session_id: SESSION_ID,
        rest_seconds: 90,
        session_sets: [
          {
            id: "set-2",
            is_warmup_set: false,
            completed_at: "2026-10-28T03:45:00.000Z",
          },
        ],
      },
    ];

    const open: OpenSession[] = [
      {
        id: SESSION_ID,
        status: "in_progress",
        local_date: "2026-10-28",
        actual_type: "weights",
        started_at: "2026-10-28T03:00:00.000Z",
      },
    ];

    const deps = createDeps(rows);
    const credited = await closeStaleSessionsCore(deps, open, NOW_MS, TODAY);

    assertEquals(credited, 1, "one session credited as completed");
    // Last set at 03:45:00, rest 90 seconds = end at 03:46:30
    // Duration: 03:00:00 to 03:46:30 = 2790 seconds
    assertEquals(mockSession.completed_at, "2026-10-28T03:46:30.000Z", "uses last working set rest (90s)");
    assertEquals(mockSession.duration_seconds, 2790, "duration includes last set rest");
  }

  console.log("\nCase 3: Last set warm-up, working set has rest null (uses 300s default)");
  {
    mockSession = {
      id: SESSION_ID,
      status: "in_progress",
      completed_at: null,
      duration_seconds: null,
    };

    const rows: SessionExerciseRow[] = [
      {
        session_id: SESSION_ID,
        rest_seconds: null,
        session_sets: [
          {
            id: "set-1",
            is_warmup_set: false,
            completed_at: "2026-10-28T03:30:00.000Z",
          },
        ],
      },
      {
        session_id: SESSION_ID,
        rest_seconds: 60,
        session_sets: [
          {
            id: "set-2",
            is_warmup_set: true,
            completed_at: "2026-10-28T03:45:00.000Z",
          },
        ],
      },
    ];

    const open: OpenSession[] = [
      {
        id: SESSION_ID,
        status: "in_progress",
        local_date: "2026-10-28",
        actual_type: "weights",
        started_at: "2026-10-28T03:00:00.000Z",
      },
    ];

    const deps = createDeps(rows);
    const credited = await closeStaleSessionsCore(deps, open, NOW_MS, TODAY);

    assertEquals(credited, 1, "one session credited as completed");
    // Last set at 03:45:00, working set rest null = 300s default
    // End at 03:45:00 + 300s = 03:50:00
    // Duration: 03:00:00 to 03:50:00 = 3000 seconds
    assertEquals(mockSession.completed_at, "2026-10-28T03:50:00.000Z", "uses 300s default for null rest");
    assertEquals(mockSession.duration_seconds, 3000, "duration includes 300s default rest");
  }

  console.log("\nCase 4: Last set warm-up, working set has rest 450 (clamped to 300)");
  {
    mockSession = {
      id: SESSION_ID,
      status: "in_progress",
      completed_at: null,
      duration_seconds: null,
    };

    const rows: SessionExerciseRow[] = [
      {
        session_id: SESSION_ID,
        rest_seconds: 450,
        session_sets: [
          {
            id: "set-1",
            is_warmup_set: false,
            completed_at: "2026-10-28T03:30:00.000Z",
          },
        ],
      },
      {
        session_id: SESSION_ID,
        rest_seconds: 60,
        session_sets: [
          {
            id: "set-2",
            is_warmup_set: true,
            completed_at: "2026-10-28T03:45:00.000Z",
          },
        ],
      },
    ];

    const open: OpenSession[] = [
      {
        id: SESSION_ID,
        status: "in_progress",
        local_date: "2026-10-28",
        actual_type: "weights",
        started_at: "2026-10-28T03:00:00.000Z",
      },
    ];

    const deps = createDeps(rows);
    const credited = await closeStaleSessionsCore(deps, open, NOW_MS, TODAY);

    assertEquals(credited, 1, "one session credited as completed");
    // Last set at 03:45:00, working set rest 450s clamped to 300s
    // End at 03:45:00 + 300s = 03:50:00
    // Duration: 03:00:00 to 03:50:00 = 3000 seconds
    assertEquals(mockSession.completed_at, "2026-10-28T03:50:00.000Z", "rest clamped to 300s");
    assertEquals(mockSession.duration_seconds, 3000, "duration with clamped rest");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All stale close warm-up rest tests passed!");
})();
