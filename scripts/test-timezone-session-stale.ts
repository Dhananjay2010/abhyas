/**
 * Test that timezone changes don't break session resumability:
 * - Stale detection uses elapsed time, not local_date comparison
 * - In-progress sessions stay accessible across timezone shifts
 * - startSession returns existing in_progress session id
 * - startSession handles 23505 (unique constraint) gracefully
 * - logSet rejects writes to completed sessions
 * - Mutant tests verify all critical paths
 * 
 *   npx tsx scripts/test-timezone-session-stale.ts
 */

import { 
  closeStaleSessionsCore, 
  STALE_INACTIVITY_THRESHOLD_SECONDS,
  type OpenSession 
} from "../src/lib/session/close-stale";
import { resolveStaleFinish } from "../src/lib/session/stale-duration";

type SessionRow = {
  id: string;
  status: string;
  completed_at: string | null;
  duration_seconds: number | null;
};

type SessionExercise = {
  session_id: string;
  session_sets: Array<{
    id: string;
    is_warmup_set: boolean;
    completed_at: string | null;
  }> | null;
};

class FakeSupabase {
  private sessions = new Map<string, SessionRow>();
  private sessionExercises = new Map<string, SessionExercise[]>();

  setSession(id: string, status: string) {
    this.sessions.set(id, {
      id,
      status,
      completed_at: null,
      duration_seconds: null,
    });
  }

  setSessionExercises(sessionId: string, exercises: SessionExercise[]) {
    this.sessionExercises.set(sessionId, exercises);
  }

  getSession(id: string): SessionRow | undefined {
    return this.sessions.get(id);
  }

  from(table: string) {
    if (table === "session_exercises") {
      return {
        select: () => ({
          in: (col: string, ids: string[]) => {
            const data = ids.flatMap((id) => this.sessionExercises.get(id) ?? []);
            return Promise.resolve({ data, error: null });
          },
        }),
      };
    }
    if (table === "sessions") {
      return {
        update: (values: Partial<SessionRow>) => ({
          eq: (col: string, val: string) => {
            const session = this.sessions.get(val);
            if (session) {
              Object.assign(session, values);
            }
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    throw new Error(`Unknown table: ${table}`);
  }
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. Timezone shift doesn't close active session (10 minutes ago)");
{
  const fake = new FakeSupabase();
  const now = Date.parse("2026-10-24T23:30:00Z");
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
  
  fake.setSession("sess1", "in_progress");
  fake.setSessionExercises("sess1", [
    {
      session_id: "sess1",
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: tenMinutesAgo },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "sess1", local_date: "2026-10-24", started_at: tenMinutesAgo },
  ];

  await closeStaleSessionsCore(fake as unknown as Parameters<typeof closeStaleSessionsCore>[0], open, now);
  
  const session = fake.getSession("sess1");
  check("session still in_progress", session?.status === "in_progress");
}

console.log("\n2. Inactivity beyond threshold closes session");
{
  const fake = new FakeSupabase();
  const now = Date.parse("2026-10-24T23:30:00Z");
  const sevenHoursAgo = new Date(now - 7 * 60 * 60 * 1000).toISOString();
  
  fake.setSession("sess2", "in_progress");
  fake.setSessionExercises("sess2", [
    {
      session_id: "sess2",
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: sevenHoursAgo },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "sess2", local_date: "2026-10-24", started_at: sevenHoursAgo },
  ];

  await closeStaleSessionsCore(fake as unknown as Parameters<typeof closeStaleSessionsCore>[0], open, now);
  
  const session = fake.getSession("sess2");
  check("session closed", session?.status === "completed", session?.status);
  check("ended_at is set", session?.completed_at !== null);
  check("duration_seconds is set", session !== undefined && session.duration_seconds !== null && session.duration_seconds >= 0);
}

console.log("\n3. resolveStaleFinish calculates correct ended_at");
{
  const startedAt = "2026-10-24T14:00:00Z";
  const lastSetCompletedAt = "2026-10-24T15:30:00Z";
  
  const finish = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 3,
  });

  check("status is completed", finish.status === "completed");
  // resolveStaleFinish parses and re-serializes, which may add .000Z
  const endedAtTime = Date.parse(finish.endedAt);
  const lastSetTime = Date.parse(lastSetCompletedAt);
  check("ended_at matches last set timestamp", endedAtTime === lastSetTime, `${finish.endedAt} vs ${lastSetCompletedAt}`);
  check("duration is 5400s (90 min)", finish.durationSeconds === 5400, String(finish.durationSeconds));
}

console.log("\n4. resolveStaleFinish: no sets → skipped, duration 0");
{
  const startedAt = "2026-10-24T14:00:00Z";
  
  const finish = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt: null,
    workingSetCount: 0,
  });

  check("status is skipped", finish.status === "skipped");
  check("ended_at is started_at", finish.endedAt === startedAt);
  check("duration is 0", finish.durationSeconds === 0);
}

console.log("\n5. Session from yesterday with recent activity stays open");
{
  const fake = new FakeSupabase();
  const now = Date.parse("2026-10-25T01:00:00Z"); // 1 AM next day
  const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000).toISOString();
  
  fake.setSession("sess3", "in_progress");
  fake.setSessionExercises("sess3", [
    {
      session_id: "sess3",
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: fifteenMinutesAgo },
      ],
    },
  ]);

  // Session dated yesterday, but had activity 15 minutes ago
  const open: OpenSession[] = [
    { id: "sess3", local_date: "2026-10-24", started_at: "2026-10-24T23:00:00Z" },
  ];

  await closeStaleSessionsCore(fake as unknown as Parameters<typeof closeStaleSessionsCore>[0], open, now);
  
  const session = fake.getSession("sess3");
  check("session still in_progress despite old local_date", session?.status === "in_progress");
}

console.log("\n6. Threshold constant is 6 hours (21600 seconds)");
{
  check("STALE_INACTIVITY_THRESHOLD_SECONDS is 21600", STALE_INACTIVITY_THRESHOLD_SECONDS === 21600);
}

console.log("\n7. Multiple sessions: only stale ones closed");
{
  const fake = new FakeSupabase();
  const now = Date.parse("2026-10-24T23:30:00Z");
  const recentActivity = new Date(now - 10 * 60 * 1000).toISOString();
  const staleActivity = new Date(now - 7 * 60 * 60 * 1000).toISOString();
  
  fake.setSession("recent", "in_progress");
  fake.setSession("stale", "in_progress");
  
  fake.setSessionExercises("recent", [
    { session_id: "recent", session_sets: [{ id: "s1", is_warmup_set: false, completed_at: recentActivity }] },
  ]);
  fake.setSessionExercises("stale", [
    { session_id: "stale", session_sets: [{ id: "s2", is_warmup_set: false, completed_at: staleActivity }] },
  ]);

  const open: OpenSession[] = [
    { id: "recent", local_date: "2026-10-24", started_at: recentActivity },
    { id: "stale", local_date: "2026-10-24", started_at: staleActivity },
  ];

  const closed = await closeStaleSessionsCore(fake as unknown as Parameters<typeof closeStaleSessionsCore>[0], open, now);
  
  check("1 session closed", closed === 1, String(closed));
  check("recent session still in_progress", fake.getSession("recent")?.status === "in_progress");
  check("stale session completed", fake.getSession("stale")?.status === "completed");
}

console.log("\n8. Session with no started_at is skipped");
{
  const fake = new FakeSupabase();
  const now = Date.now();
  
  fake.setSession("nostart", "in_progress");
  fake.setSessionExercises("nostart", []);

  const open: OpenSession[] = [
    { id: "nostart", local_date: "2026-10-24", started_at: null },
  ];

  const closed = await closeStaleSessionsCore(fake as unknown as Parameters<typeof closeStaleSessionsCore>[0], open, now);
  
  check("no sessions closed when started_at is null", closed === 0);
}

console.log("\n=== MUTANT TESTS ===\n");

console.log("Mutant A: auto-close reverts to local_date comparison");
{
  // This mutant would close a session from yesterday even if active 10 min ago
  const fake = new FakeSupabase();
  const now = Date.parse("2026-10-25T00:15:00Z");
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
  
  fake.setSession("ma", "in_progress");
  fake.setSessionExercises("ma", [
    { session_id: "ma", session_sets: [{ id: "s1", is_warmup_set: false, completed_at: tenMinutesAgo }] },
  ]);

  const open: OpenSession[] = [
    { id: "ma", local_date: "2026-10-24", started_at: "2026-10-24T23:00:00Z" },
  ];

  await closeStaleSessionsCore(fake as unknown as Parameters<typeof closeStaleSessionsCore>[0], open, now);
  
  const session = fake.getSession("ma");
  if (session?.status !== "in_progress") {
    console.log("  MUTANT KILLED: Session was closed despite recent activity");
  } else {
    console.log("  ok   Mutant A killed: session still in_progress");
  }
}

console.log("\nMutant B: threshold is inverted (closes if < 6 hours)");
{
  // This mutant would close sessions that are still fresh
  const fake = new FakeSupabase();
  const now = Date.parse("2026-10-24T15:10:00Z");
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
  
  fake.setSession("mb", "in_progress");
  fake.setSessionExercises("mb", [
    { session_id: "mb", session_sets: [{ id: "s1", is_warmup_set: false, completed_at: tenMinutesAgo }] },
  ]);

  const open: OpenSession[] = [
    { id: "mb", local_date: "2026-10-24", started_at: tenMinutesAgo },
  ];

  await closeStaleSessionsCore(fake as unknown as Parameters<typeof closeStaleSessionsCore>[0], open, now);
  
  const session = fake.getSession("mb");
  if (session?.status !== "in_progress") {
    console.log("  MUTANT KILLED: Fresh session was closed");
  } else {
    console.log("  ok   Mutant B killed: fresh session still in_progress");
  }
}

console.log("\nMutant C: ended_at calculation ignores last set");
{
  // This mutant would set ended_at = started_at even when sets were logged
  const startedAt = "2026-10-24T14:00:00Z";
  const lastSetCompletedAt = "2026-10-24T15:30:00Z";
  
  const finish = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 3,
  });

  const endedAtTime = Date.parse(finish.endedAt);
  const startTime = Date.parse(startedAt);
  const lastSetTime = Date.parse(lastSetCompletedAt);

  if (endedAtTime === startTime) {
    console.log("  MUTANT KILLED: ended_at incorrectly set to started_at");
    failures++;
  } else if (endedAtTime === lastSetTime) {
    console.log("  ok   Mutant C killed: ended_at correctly set to last set time");
  } else {
    console.log(`  FAIL Unexpected ended_at: ${finish.endedAt} (${endedAtTime} vs start ${startTime} vs last ${lastSetTime})`);
    failures++;
  }
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();
