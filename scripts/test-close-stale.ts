#!/usr/bin/env tsx
/**
 * Test close-stale routes through resolveStaleFinish.
 *
 *   npx tsx scripts/test-close-stale.ts
 */

import { closeStaleSessions, asClient } from "../src/lib/session/close-stale";

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

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

interface FakeSupabase {
  sessionUpdates: Array<{ id: string; status: string; completed_at: string | null; duration_seconds: number }>;
  from: (table: string) => unknown;
}

function makeFakeSupabase(
  sessions: Array<{ id: string; started_at: string }>,
  exercises: Array<{
    session_id: string;
    session_sets: Array<{ id: string; is_warmup_set: boolean; completed_at: string | null }>;
  }>
): FakeSupabase {
  const fake: FakeSupabase = {
    sessionUpdates: [],
    from: (table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({
            in: async () => ({ data: sessions, error: null }),
          }),
          update: (payload: { status: string; completed_at: string | null; duration_seconds: number }) => {
            return {
              eq: async (_column: string, value: string) => {
                fake.sessionUpdates.push({ id: value, ...payload });
                return { error: null };
              },
            };
          },
        };
      } else if (table === "session_exercises") {
        return {
          select: () => ({
            in: async () => ({ data: exercises, error: null }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return fake;
}

async function runTests() {
  console.log("\nTesting close-stale routes through resolveStaleFinish\n");

  console.log("1. Session with working sets: completed with last-set timestamp and duration");
  {
    const startedAt = new Date("2026-10-23T10:00:00Z").toISOString();
    const lastSetAt = new Date("2026-10-23T10:45:00Z").toISOString();

    const sessions = [{ id: "s1", started_at: startedAt }];
    const exercises = [
      {
        session_id: "s1",
        session_sets: [
          { id: "set1", is_warmup_set: false, completed_at: new Date("2026-10-23T10:30:00Z").toISOString() },
          { id: "set2", is_warmup_set: false, completed_at: lastSetAt },
        ],
      },
    ];

    const fake = makeFakeSupabase(sessions, exercises);
    const completed = await closeStaleSessions(
      asClient(fake),
      [{ id: "s1", local_date: "2026-10-23" }],
      "2026-10-24"
    );

    assertEquals(completed, 1, "One session completed");
    assertEquals(fake.sessionUpdates.length, 1, "One update");
    assertEquals(fake.sessionUpdates[0].status, "completed", "Status is completed");
    assertEquals(fake.sessionUpdates[0].completed_at, lastSetAt, "completed_at is last set time");
    assertEquals(fake.sessionUpdates[0].duration_seconds, 2700, "duration is 45 minutes (2700s)");
  }

  console.log("\n2. Session with no sets: skipped with 0 duration");
  {
    const startedAt = new Date("2026-10-23T10:00:00Z").toISOString();

    const sessions = [{ id: "s2", started_at: startedAt }];
    const exercises = [
      {
        session_id: "s2",
        session_sets: [],
      },
    ];

    const fake = makeFakeSupabase(sessions, exercises);
    const completed = await closeStaleSessions(
      asClient(fake),
      [{ id: "s2", local_date: "2026-10-23" }],
      "2026-10-24"
    );

    assertEquals(completed, 0, "Zero sessions completed");
    assertEquals(fake.sessionUpdates.length, 1, "One update");
    assertEquals(fake.sessionUpdates[0].status, "skipped", "Status is skipped");
    assertEquals(fake.sessionUpdates[0].completed_at, null, "completed_at is null for skipped");
    assertEquals(fake.sessionUpdates[0].duration_seconds, 0, "duration is 0");
  }

  console.log("\n3. Session with only warmup sets: skipped");
  {
    const startedAt = new Date("2026-10-23T10:00:00Z").toISOString();

    const sessions = [{ id: "s3", started_at: startedAt }];
    const exercises = [
      {
        session_id: "s3",
        session_sets: [
          { id: "warmup1", is_warmup_set: true, completed_at: new Date("2026-10-23T10:15:00Z").toISOString() },
          { id: "warmup2", is_warmup_set: true, completed_at: new Date("2026-10-23T10:20:00Z").toISOString() },
        ],
      },
    ];

    const fake = makeFakeSupabase(sessions, exercises);
    const completed = await closeStaleSessions(
      asClient(fake),
      [{ id: "s3", local_date: "2026-10-23" }],
      "2026-10-24"
    );

    assertEquals(completed, 0, "Zero sessions completed (warmups don't count)");
    assertEquals(fake.sessionUpdates.length, 1, "One update");
    assertEquals(fake.sessionUpdates[0].status, "skipped", "Status is skipped");
  }

  console.log("\n4. No stale sessions: no updates");
  {
    const sessions: Array<{ id: string; started_at: string }> = [];
    const exercises: Array<{ session_id: string; session_sets: Array<{ id: string; is_warmup_set: boolean; completed_at: string | null }> }> = [];

    const fake = makeFakeSupabase(sessions, exercises);
    const completed = await closeStaleSessions(
      asClient(fake),
      [{ id: "s4", local_date: "2026-10-24" }],
      "2026-10-24"
    );

    assertEquals(completed, 0, "No sessions completed");
    assertEquals(fake.sessionUpdates.length, 0, "No updates (not stale)");
  }

  console.log("\n5. Multiple sessions: mix of completed and skipped");
  {
    const startedAt1 = new Date("2026-10-23T09:00:00Z").toISOString();
    const lastSet1 = new Date("2026-10-23T09:30:00Z").toISOString();
    const startedAt2 = new Date("2026-10-23T14:00:00Z").toISOString();

    const sessions = [
      { id: "s5a", started_at: startedAt1 },
      { id: "s5b", started_at: startedAt2 },
    ];
    const exercises = [
      {
        session_id: "s5a",
        session_sets: [
          { id: "set1", is_warmup_set: false, completed_at: lastSet1 },
        ],
      },
      {
        session_id: "s5b",
        session_sets: [],
      },
    ];

    const fake = makeFakeSupabase(sessions, exercises);
    const completed = await closeStaleSessions(
      asClient(fake),
      [
        { id: "s5a", local_date: "2026-10-23" },
        { id: "s5b", local_date: "2026-10-23" },
      ],
      "2026-10-24"
    );

    assertEquals(completed, 1, "One session completed");
    assertEquals(fake.sessionUpdates.length, 2, "Two updates");

    const s5aUpdate = fake.sessionUpdates.find(u => u.id === "s5a");
    const s5bUpdate = fake.sessionUpdates.find(u => u.id === "s5b");

    assertTrue(!!s5aUpdate, "s5a updated");
    assertTrue(!!s5bUpdate, "s5b updated");
    assertEquals(s5aUpdate!.status, "completed", "s5a completed");
    assertEquals(s5bUpdate!.status, "skipped", "s5b skipped");
    assertEquals(s5aUpdate!.duration_seconds, 1800, "s5a duration is 30 min (1800s)");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All close-stale tests passed!");
}

runTests();
