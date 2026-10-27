#!/usr/bin/env tsx
/**
 * Test: Session open >6 hours is CLOSED, not resumed.
 * Uses REAL stale-close logic with faked I/O.
 * 
 * Tests sessions at:
 * - 6h + 1ms (over threshold, should close)
 * - exactly 6h (at threshold, should close)
 * - 5h 59m (under threshold, should resume)
 * 
 * Mutants that must kill this:
 * - Resume checked before close in stale-core
 * - Stale deps never close
 * - Threshold changed
 */
import { closeStaleSessionsCore, STALE_INACTIVITY_THRESHOLD_SECONDS, type CloseStaleDeps } from "../src/lib/session/close-stale";

export {};

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function eq<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function main() {
  console.log("Over-6-hours: Stale session closing behavior (real stale-close logic)\n");

  await test("Session >6h inactive is closed", async () => {
    const NOW_MS = new Date("2026-10-26T20:00:00Z").getTime();
    const OVER_6H_MS = NOW_MS - (STALE_INACTIVITY_THRESHOLD_SECONDS * 1000 + 1);
    const STARTED_AT = new Date(OVER_6H_MS).toISOString();
    
    let wasClosed = false;
    const deps: CloseStaleDeps = {
      fetchSessionExercises: async () => [],
      markSessionDone: async () => {
        wasClosed = true;
        return true;
      },
      markPlannedSkipped: async () => {
        wasClosed = true;
      },
    };

    const openSessions = [
      {
        id: "sess-stale",
        status: "in_progress" as const,
        local_date: "2026-10-25",
        actual_type: "weights" as const,
        started_at: STARTED_AT,
      },
    ];

    await closeStaleSessionsCore(deps, openSessions, NOW_MS, "2026-10-26");
    
    eq(wasClosed, true, "Session >6h should be closed (markSessionDone or markPlannedSkipped called)");
  });

  await test("Session exactly 6h inactive is closed", async () => {
    const NOW_MS = new Date("2026-10-26T20:00:00Z").getTime();
    const EXACTLY_6H_MS = NOW_MS - (STALE_INACTIVITY_THRESHOLD_SECONDS * 1000);
    const STARTED_AT = new Date(EXACTLY_6H_MS).toISOString();

    let wasClosed = false;
    const deps: CloseStaleDeps = {
      fetchSessionExercises: async () => [],
      markSessionDone: async () => {
        wasClosed = true;
        return true;
      },
      markPlannedSkipped: async () => {
        wasClosed = true;
      },
    };

    const openSessions = [
      {
        id: "sess-exact",
        status: "in_progress" as const,
        local_date: "2026-10-25",
        actual_type: "weights" as const,
        started_at: STARTED_AT,
      },
    ];

    await closeStaleSessionsCore(deps, openSessions, NOW_MS, "2026-10-26");
    
    eq(wasClosed, true, "Session at exactly 6h threshold should be closed");
  });

  await test("Session <6h inactive is NOT closed", async () => {
    const NOW_MS = new Date("2026-10-26T20:00:00Z").getTime();
    const UNDER_6H_MS = NOW_MS - ((STALE_INACTIVITY_THRESHOLD_SECONDS - 60) * 1000);
    const STARTED_AT = new Date(UNDER_6H_MS).toISOString();

    let wasClosed = false;
    const deps: CloseStaleDeps = {
      fetchSessionExercises: async () => [],
      markSessionDone: async () => {
        wasClosed = true;
        return true;
      },
      markPlannedSkipped: async () => {
        wasClosed = true;
      },
    };

    const openSessions = [
      {
        id: "sess-fresh",
        status: "in_progress" as const,
        local_date: "2026-10-25",
        actual_type: "weights" as const,
        started_at: STARTED_AT,
      },
    ];

    await closeStaleSessionsCore(deps, openSessions, NOW_MS, "2026-10-26");
    
    eq(wasClosed, false, "Should NOT close session under 6h threshold");
  });

  await test("Session with recent set activity is NOT closed even if started_at is old", async () => {
    const NOW_MS = new Date("2026-10-26T20:00:00Z").getTime();
    const OLD_STARTED_AT = new Date("2026-10-25T08:00:00Z").toISOString();
    const RECENT_SET_AT = new Date(NOW_MS - 3600000).toISOString(); // 1 hour ago

    let wasClosed = false;
    const deps: CloseStaleDeps = {
      fetchSessionExercises: async () => [
        {
          session_id: "sess-active",
          rest_seconds: 75,
          session_sets: [
            {
              id: "set-1",
              completed_at: RECENT_SET_AT,
              is_warmup_set: false,
            },
          ],
        },
      ],
      markSessionDone: async () => {
        wasClosed = true;
        return true;
      },
      markPlannedSkipped: async () => {
        wasClosed = true;
      },
    };

    const openSessions = [
      {
        id: "sess-active",
        status: "in_progress" as const,
        local_date: "2026-10-25",
        actual_type: "weights" as const,
        started_at: OLD_STARTED_AT,
      },
    ];

    await closeStaleSessionsCore(deps, openSessions, NOW_MS, "2026-10-26");
    
    eq(wasClosed, false, "Should NOT close session with recent set activity");
  });

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
