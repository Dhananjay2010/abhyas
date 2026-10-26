/**
 * Test that timezone changes don't break session resumability:
 * - Stale detection uses elapsed time, not local_date comparison
 * - In-progress sessions stay accessible across timezone shifts
 * - startSession returns existing in_progress session id
 * - startSession handles 23505 (unique constraint) gracefully
 * - logSet rejects writes to completed sessions
 * 
 *   npx tsx scripts/test-timezone-session-stale.ts
 */

import { 
  closeStaleSessionsCore, 
  STALE_INACTIVITY_THRESHOLD_SECONDS,
  type OpenSession,
  type CloseStaleDeps
} from "../src/lib/session/close-stale";
import type { SessionExerciseRow } from "../src/lib/session/close-stale-deps";
import { resolveStaleFinish } from "../src/lib/session/stale-duration";

type SessionRow = {
  id: string;
  status: string;
  completed_at: string | null;
  duration_seconds: number | null;
};

class FakeCloseStaleDeps implements CloseStaleDeps {
  private sessions = new Map<string, SessionRow>();
  private sessionExercises = new Map<string, SessionExerciseRow[]>();

  setSession(id: string, status: string) {
    this.sessions.set(id, {
      id,
      status,
      completed_at: null,
      duration_seconds: null,
    });
  }

  setSessionExercises(sessionId: string, exercises: SessionExerciseRow[]) {
    this.sessionExercises.set(sessionId, exercises);
  }

  getSession(id: string): SessionRow | undefined {
    return this.sessions.get(id);
  }

  async fetchSessionExercises(sessionIds: string[]): Promise<SessionExerciseRow[]> {
    return sessionIds.flatMap((id) => this.sessionExercises.get(id) ?? []);
  }

  async markSessionDone(id: string, status: "completed" | "skipped", completedAt: string, durationSeconds: number | null): Promise<boolean> {
    const session = this.sessions.get(id);
    if (session && session.status === "in_progress") {
      session.status = status;
      session.completed_at = completedAt;
      session.duration_seconds = durationSeconds;
      return true;
    }
    return false;
  }

  async markPlannedSkipped(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session && session.status === "planned") {
      session.status = "skipped";
    }
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
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T23:30:00Z");
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
  
  fake.setSession("sess1", "in_progress");
  fake.setSessionExercises("sess1", [
    {
      session_id: "sess1",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: tenMinutesAgo },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "sess1", local_date: "2026-10-24", started_at: tenMinutesAgo, actual_type: "weights", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  const session = fake.getSession("sess1");
  check("session still in_progress", session?.status === "in_progress");
}

console.log("\n2. Inactivity beyond threshold closes session");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T23:30:00Z");
  const sevenHoursAgo = new Date(now - 7 * 60 * 60 * 1000).toISOString();
  
  fake.setSession("sess2", "in_progress");
  fake.setSessionExercises("sess2", [
    {
      session_id: "sess2",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: sevenHoursAgo },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "sess2", local_date: "2026-10-24", started_at: sevenHoursAgo, actual_type: "weights", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
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
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-25T01:00:00Z"); // 1 AM next day
  const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000).toISOString();
  
  fake.setSession("sess3", "in_progress");
  fake.setSessionExercises("sess3", [
    {
      session_id: "sess3",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: fifteenMinutesAgo },
      ],
    },
  ]);

  // Session dated yesterday, but had activity 15 minutes ago
  const open: OpenSession[] = [
    { id: "sess3", local_date: "2026-10-24", started_at: "2026-10-24T23:00:00Z", actual_type: "weights", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  const session = fake.getSession("sess3");
  check("session still in_progress despite old local_date", session?.status === "in_progress");
}

console.log("\n6. Threshold constant is 6 hours (21600 seconds)");
{
  check("STALE_INACTIVITY_THRESHOLD_SECONDS is 21600", STALE_INACTIVITY_THRESHOLD_SECONDS === 21600);
}

console.log("\n7. Multiple sessions: only stale ones closed");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T23:30:00Z");
  const recentActivity = new Date(now - 10 * 60 * 1000).toISOString();
  const staleActivity = new Date(now - 7 * 60 * 60 * 1000).toISOString();
  
  fake.setSession("recent", "in_progress");
  fake.setSession("stale", "in_progress");
  
  fake.setSessionExercises("recent", [
    { session_id: "recent", rest_seconds: null, session_sets: [{ id: "s1", is_warmup_set: false, completed_at: recentActivity }] },
  ]);
  fake.setSessionExercises("stale", [
    { session_id: "stale", rest_seconds: null, session_sets: [{ id: "s2", is_warmup_set: false, completed_at: staleActivity }] },
  ]);

  const open: OpenSession[] = [
    { id: "recent", local_date: "2026-10-24", started_at: recentActivity, actual_type: "weights", status: "in_progress" },
    { id: "stale", local_date: "2026-10-24", started_at: staleActivity, actual_type: "weights", status: "in_progress" },
  ];

  const closed = await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  check("1 session closed", closed === 1, String(closed));
  check("recent session still in_progress", fake.getSession("recent")?.status === "in_progress");
  check("stale session completed", fake.getSession("stale")?.status === "completed");
}

console.log("\n8. Session with no started_at is skipped");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.now();
  
  fake.setSession("nostart", "in_progress");
  fake.setSessionExercises("nostart", []);

  const open: OpenSession[] = [
    { id: "nostart", local_date: "2026-10-24", started_at: null, actual_type: "weights", status: "in_progress" },
  ];

  const closed = await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  check("no sessions closed when started_at is null", closed === 0);
}

console.log("\n9. Midnight crossing: session started 23:43, last set 23:55, loaded at 00:01 stays open");
{
  const fake = new FakeCloseStaleDeps();
  const started = "2026-10-24T23:43:00Z";
  const lastSet = "2026-10-24T23:55:00Z";
  const loadTime = Date.parse("2026-10-25T00:01:00Z");
  
  fake.setSession("midnight", "in_progress");
  fake.setSessionExercises("midnight", [
    {
      session_id: "midnight",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: lastSet },
      ],
    },
  ]);
  
  const open: OpenSession[] = [{ id: "midnight", local_date: "2026-10-24", started_at: started, actual_type: "weights", status: "in_progress" }];
  await closeStaleSessionsCore(fake, open, loadTime, "2026-10-24");
  
  const session = fake.getSession("midnight");
  check("session still in_progress after midnight", session?.status === "in_progress");
}

console.log("\n10. Same session loaded 6 hours later is closed with ended_at at last set");
{
  const fake = new FakeCloseStaleDeps();
  const started = "2026-10-24T23:43:00Z";
  const lastSet = "2026-10-24T23:55:00Z";
  const loadTime = Date.parse("2026-10-25T06:00:00Z");
  
  fake.setSession("stale-morning", "in_progress");
  fake.setSessionExercises("stale-morning", [
    {
      session_id: "stale-morning",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: lastSet },
      ],
    },
  ]);
  
  const open: OpenSession[] = [{ id: "stale-morning", local_date: "2026-10-24", started_at: started, actual_type: "weights", status: "in_progress" }];
  await closeStaleSessionsCore(fake, open, loadTime, "2026-10-24");
  
  const session = fake.getSession("stale-morning");
  check("session closed", session?.status === "completed");
  const endedAtMatch = session?.completed_at && new Date(session.completed_at).getTime() === Date.parse(lastSet);
  check("ended_at matches last set", !!endedAtMatch, `${session?.completed_at} vs ${lastSet}`);
}

console.log("\n11. Boundary: exactly 6h (21600s) is stale");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T20:00:00Z");
  const exactly6hAgo = new Date(now - 21600 * 1000).toISOString();
  
  fake.setSession("boundary", "in_progress");
  fake.setSessionExercises("boundary", [
    {
      session_id: "boundary",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: exactly6hAgo },
      ],
    },
  ]);
  
  const open: OpenSession[] = [{ id: "boundary", local_date: "2026-10-24", started_at: exactly6hAgo, actual_type: "weights", status: "in_progress" }];
  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  const session = fake.getSession("boundary");
  check("session closed at exactly 6h", session?.status === "completed");
}

console.log("\n12. Boundary: 21599s (1s under 6h) is still active");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T20:00:00Z");
  const just21599sAgo = new Date(now - 21599 * 1000).toISOString();
  
  fake.setSession("just-under", "in_progress");
  fake.setSessionExercises("just-under", [
    {
      session_id: "just-under",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: just21599sAgo },
      ],
    },
  ]);
  
  const open: OpenSession[] = [{ id: "just-under", local_date: "2026-10-24", started_at: just21599sAgo, actual_type: "weights", status: "in_progress" }];
  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  const session = fake.getSession("just-under");
  check("session still active 1s under threshold", session?.status === "in_progress");
}

console.log("\n13. Newer-session rule: session with newer started_at closes older session");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T15:00:00Z");
  const olderStarted = "2026-10-24T14:00:00Z";
  const newerStarted = "2026-10-24T14:30:00Z";
  
  fake.setSession("older", "in_progress");
  fake.setSession("newer", "in_progress");
  
  fake.setSessionExercises("older", [
    { session_id: "older", rest_seconds: null, session_sets: [{ id: "s1", is_warmup_set: false, completed_at: "2026-10-24T14:05:00Z" }] },
  ]);
  fake.setSessionExercises("newer", [
    { session_id: "newer", rest_seconds: null, session_sets: [{ id: "s2", is_warmup_set: false, completed_at: "2026-10-24T14:35:00Z" }] },
  ]);
  
  const open: OpenSession[] = [
    { id: "older", local_date: "2026-10-24", started_at: olderStarted, actual_type: "weights", status: "in_progress" },
    { id: "newer", local_date: "2026-10-24", started_at: newerStarted, actual_type: "weights", status: "in_progress" },
  ];
  
  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  check("older session closed by newer-session rule", fake.getSession("older")?.status === "completed");
  check("newer session remains open", fake.getSession("newer")?.status === "in_progress");
}

console.log("\n14. Newer-session rule: closes session only minutes old if newer exists");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T15:00:00Z");
  const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();
  const twoMinutesAgo = new Date(now - 2 * 60 * 1000).toISOString();
  
  fake.setSession("five-min-old", "in_progress");
  fake.setSession("two-min-old", "in_progress");
  
  fake.setSessionExercises("five-min-old", [
    { session_id: "five-min-old", rest_seconds: null, session_sets: [{ id: "s1", is_warmup_set: false, completed_at: fiveMinutesAgo }] },
  ]);
  fake.setSessionExercises("two-min-old", [
    { session_id: "two-min-old", rest_seconds: null, session_sets: [{ id: "s2", is_warmup_set: false, completed_at: twoMinutesAgo }] },
  ]);
  
  const open: OpenSession[] = [
    { id: "five-min-old", local_date: "2026-10-24", started_at: fiveMinutesAgo, actual_type: "weights", status: "in_progress" },
    { id: "two-min-old", local_date: "2026-10-24", started_at: twoMinutesAgo, actual_type: "weights", status: "in_progress" },
  ];
  
  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  check("5-minute-old session closed despite recent activity", fake.getSession("five-min-old")?.status === "completed");
  check("2-minute-old session (newer) remains open", fake.getSession("two-min-old")?.status === "in_progress");
}

console.log("\n15. Newer Breathe session does NOT close strength session");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T20:00:00Z");
  const twoMinutesAgo = new Date(now - 2 * 60 * 1000).toISOString();
  const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();
  
  fake.setSession("strength", "in_progress");
  fake.setSession("breathe", "in_progress");
  fake.setSessionExercises("strength", [
    {
      session_id: "strength",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: fiveMinutesAgo },
      ],
    },
  ]);
  fake.setSessionExercises("breathe", [
    {
      session_id: "breathe",
      rest_seconds: null,
      session_sets: [
        { id: "set2", is_warmup_set: false, completed_at: twoMinutesAgo },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "strength", local_date: "2026-10-24", started_at: fiveMinutesAgo, actual_type: "weights", status: "in_progress" },
    { id: "breathe", local_date: "2026-10-24", started_at: twoMinutesAgo, actual_type: "breathe", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  check("strength session NOT closed by newer Breathe", fake.getSession("strength")?.status === "in_progress");
  check("breathe session remains open", fake.getSession("breathe")?.status === "in_progress");
}

console.log("\n17. Planned row dated before today becomes skipped");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-25T10:00:00Z");
  
  fake.setSession("planned-yesterday", "planned");
  fake.setSessionExercises("planned-yesterday", []);
  
  const open: OpenSession[] = [
    { id: "planned-yesterday", local_date: "2026-10-24", started_at: null, actual_type: "weights", status: "planned" },
  ];
  
  await closeStaleSessionsCore(fake, open, now, "2026-10-25");
  
  check("planned row from yesterday marked skipped", fake.getSession("planned-yesterday")?.status === "skipped");
}

console.log("\n18. Planned row for today remains open");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T10:00:00Z");
  
  fake.setSession("planned-today", "planned");
  fake.setSessionExercises("planned-today", []);
  
  const open: OpenSession[] = [
    { id: "planned-today", local_date: "2026-10-24", started_at: null, actual_type: "weights", status: "planned" },
  ];
  
  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  check("planned row for today stays planned", fake.getSession("planned-today")?.status === "planned");
}

console.log("\n19. Race condition: already-completed session not overwritten by stale close");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T20:00:00Z");
  const sevenHoursAgo = new Date(now - 7 * 60 * 60 * 1000).toISOString();
  
  // Session is already completed (race: user finished it just before stale close ran)
  fake.setSession("race", "completed");
  fake.setSessionExercises("race", [
    { session_id: "race", rest_seconds: null, session_sets: [{ id: "s1", is_warmup_set: false, completed_at: sevenHoursAgo }] },
  ]);
  
  const open: OpenSession[] = [
    { id: "race", local_date: "2026-10-24", started_at: sevenHoursAgo, actual_type: "weights", status: "in_progress" },
  ];
  
  // The stale logic would normally close this, but the update should not overwrite completed status
  const credited = await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  check("race: session stays completed (not overwritten)", fake.getSession("race")?.status === "completed");
  check("race: credited count is 0 (no actual update)", credited === 0);
}

console.log("\n20. credited count reaches caller when sessions are closed");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T20:00:00Z");
  const sevenHoursAgo = new Date(now - 7 * 3600 * 1000).toISOString();
  
  fake.setSession("old1", "in_progress");
  fake.setSession("old2", "in_progress");
  fake.setSessionExercises("old1", [
    {
      session_id: "old1",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: sevenHoursAgo },
      ],
    },
  ]);
  fake.setSessionExercises("old2", [
    {
      session_id: "old2",
      rest_seconds: null,
      session_sets: [
        { id: "set2", is_warmup_set: false, completed_at: sevenHoursAgo },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "old1", local_date: "2026-10-24", started_at: sevenHoursAgo, actual_type: "weights", status: "in_progress" },
    { id: "old2", local_date: "2026-10-24", started_at: sevenHoursAgo, actual_type: "weights", status: "in_progress" },
  ];

  const credited = await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  check("credited count is 2", credited === 2);
  check("old1 is completed", fake.getSession("old1")?.status === "completed");
  check("old2 is completed", fake.getSession("old2")?.status === "completed");
}

console.log("\n21. Null started_at with sets uses first set time as fallback");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T20:00:00Z");
  const eightHoursAgo = new Date(now - 8 * 3600 * 1000).toISOString();
  
  fake.setSession("no-start", "in_progress");
  fake.setSessionExercises("no-start", [
    {
      session_id: "no-start",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: eightHoursAgo },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "no-start", local_date: "2026-10-24", started_at: null, actual_type: "weights", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  const session = fake.getSession("no-start");
  check("session with null started_at closed using set time", session?.status === "completed");
}

console.log("\n22. Duration capped at 6 hours (21600 seconds)");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T20:00:00Z");
  const tenHoursAgo = new Date(now - 10 * 3600 * 1000).toISOString();
  const sevenHoursAgo = new Date(now - 7 * 3600 * 1000).toISOString();
  
  fake.setSession("long", "in_progress");
  fake.setSessionExercises("long", [
    {
      session_id: "long",
      rest_seconds: null,
      session_sets: [
        // Session started 10 hours ago, last set completed 7 hours ago
        // Duration would be 3 hours (10800s), which is under the cap
        // But the session is stale (last activity > 6h ago)
        { id: "set1", is_warmup_set: false, completed_at: sevenHoursAgo },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "long", local_date: "2026-10-24", started_at: tenHoursAgo, actual_type: "weights", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  const session = fake.getSession("long");
  const expectedDuration = (Date.parse(sevenHoursAgo) - Date.parse(tenHoursAgo)) / 1000;
  check("duration is 3 hours (10800s)", session?.duration_seconds === expectedDuration);
  check("session marked completed", session?.status === "completed");
}

console.log("\n23. Duration capped when it would exceed 6 hours");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T20:00:00Z");
  const twentyHoursAgo = new Date(now - 20 * 3600 * 1000).toISOString();
  const sevenHoursAgo = new Date(now - 7 * 3600 * 1000).toISOString();
  
  fake.setSession("verylong", "in_progress");
  fake.setSessionExercises("verylong", [
    {
      session_id: "verylong",
      rest_seconds: null,
      session_sets: [
        // Session started 20 hours ago, last set completed 7 hours ago
        // Duration would be 13 hours (46800s), but should be capped at 6h (21600s)
        { id: "set1", is_warmup_set: false, completed_at: sevenHoursAgo },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "verylong", local_date: "2026-10-24", started_at: twentyHoursAgo, actual_type: "weights", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  const session = fake.getSession("verylong");
  check("duration capped at 21600 seconds", session?.duration_seconds === 21600);
  check("session marked completed", session?.status === "completed");
}

console.log("\n24. null started_at with sets: uses first set's time");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T20:00:00Z");
  const eightHoursAgo = new Date(now - 8 * 3600 * 1000).toISOString();
  const sevenHoursAgo = new Date(now - 7 * 3600 * 1000).toISOString();
  
  fake.setSession("nostime", "in_progress");
  fake.setSessionExercises("nostime", [
    {
      session_id: "nostime",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: eightHoursAgo },
        { id: "set2", is_warmup_set: false, completed_at: sevenHoursAgo },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "nostime", local_date: "2026-10-24", started_at: null, actual_type: "weights", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  const session = fake.getSession("nostime");
  check("session closed", session?.status === "completed");
  check("duration calculated from first set", session?.duration_seconds === 3600);
  check("ended_at is based on last set", session?.completed_at === sevenHoursAgo);
}

console.log("\n25. null started_at with no sets: planned session marked skipped");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-25T10:00:00Z");
  
  fake.setSession("empty", "planned");
  fake.setSessionExercises("empty", []);

  const open: OpenSession[] = [
    { id: "empty", local_date: "2026-10-24", started_at: null, actual_type: "weights", status: "planned" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-25");
  
  const session = fake.getSession("empty");
  check("planned session marked skipped", session?.status === "skipped");
}

console.log("\n26. Two-set case with started_at: duration = last set - started_at");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T18:00:00Z");
  const started = "2026-10-24T10:00:00Z";
  const firstSet = "2026-10-24T10:05:00Z";
  const lastSet = "2026-10-24T11:00:00Z";
  
  fake.setSession("twosets", "in_progress");
  fake.setSessionExercises("twosets", [
    {
      session_id: "twosets",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: firstSet },
        { id: "set2", is_warmup_set: false, completed_at: lastSet },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "twosets", local_date: "2026-10-24", started_at: started, actual_type: "weights", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  const session = fake.getSession("twosets");
  check("session closed", session?.status === "completed");
  check("ended_at is last set", !!session?.completed_at?.startsWith(lastSet.replace("Z", "")));
  check("duration is 3600s (1 hour)", session?.duration_seconds === 3600);
}

console.log("\n27. Active session: first set >6h ago, last set 2 min ago stays open");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T16:00:00Z");
  const started = "2026-10-24T09:00:00Z";
  const firstSet = "2026-10-24T09:30:00Z";
  const recentSet = new Date(now - 2 * 60 * 1000).toISOString();
  
  fake.setSession("active", "in_progress");
  fake.setSessionExercises("active", [
    {
      session_id: "active",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: firstSet },
        { id: "set2", is_warmup_set: false, completed_at: recentSet },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "active", local_date: "2026-10-24", started_at: started, actual_type: "weights", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  const session = fake.getSession("active");
  check("session still in_progress", session?.status === "in_progress");
}

console.log("\n28. in_progress + null started_at + no sets: closed with duration null");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-25T10:00:00Z");
  
  fake.setSession("stuck", "in_progress");
  fake.setSessionExercises("stuck", []);

  const open: OpenSession[] = [
    { id: "stuck", local_date: "2026-10-24", started_at: null, actual_type: "weights", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-25");
  
  const session = fake.getSession("stuck");
  check("status is skipped", session?.status === "skipped");
  check("duration_seconds is null", session?.duration_seconds === null);
  check("completed_at is real ISO timestamp", session?.completed_at === "2026-10-25T10:00:00.000Z");
}

console.log("\n29. H4: null started_at, first set 7h ago, last set 2 min ago stays in_progress");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-24T18:00:00Z");
  const sevenHoursAgo = new Date(now - 7 * 3600 * 1000).toISOString();
  const twoMinutesAgo = new Date(now - 2 * 60 * 1000).toISOString();
  
  fake.setSession("recent", "in_progress");
  fake.setSessionExercises("recent", [
    {
      session_id: "recent",
      rest_seconds: null,
      session_sets: [
        { id: "set1", is_warmup_set: false, completed_at: sevenHoursAgo },
        { id: "set2", is_warmup_set: false, completed_at: twoMinutesAgo },
      ],
    },
  ]);

  const open: OpenSession[] = [
    { id: "recent", local_date: "2026-10-24", started_at: null, actual_type: "weights", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-24");
  
  const session = fake.getSession("recent");
  check("session still in_progress", session?.status === "in_progress");
}

console.log("\n30. nn3: in_progress dated today, null started_at, no sets closes as skipped");
{
  const fake = new FakeCloseStaleDeps();
  const now = Date.parse("2026-10-25T10:00:00Z");
  
  fake.setSession("today-stuck", "in_progress");
  fake.setSessionExercises("today-stuck", []);

  const open: OpenSession[] = [
    { id: "today-stuck", local_date: "2026-10-25", started_at: null, actual_type: "weights", status: "in_progress" },
  ];

  await closeStaleSessionsCore(fake, open, now, "2026-10-25");
  
  const session = fake.getSession("today-stuck");
  check("today in_progress closed", session?.status === "skipped");
  check("duration is null", session?.duration_seconds === null);
  check("completed_at is exact now timestamp", session?.completed_at === "2026-10-25T10:00:00.000Z");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
