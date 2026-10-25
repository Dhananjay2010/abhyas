/**
 * Test that ending a session early with working sets is handled correctly:
 * - decideAbandonStatus returns "completed" when working sets exist
 * - abandonSessionCore applies status + duration only once (idempotent)
 * - Duration is clamped to 0..6 hours
 * - Early-ended completed sessions count toward streak
 * - Completed sessions are not re-offered by pickReusableSession
 * 
 *   npx tsx scripts/test-abandon-session.ts
 */

import { decideAbandonStatus, abandonSessionCore, type SessionExercise, type SupabaseClient } from "../src/lib/session/abandon-session";
import { buildDayRecords, computeStreaks } from "../src/lib/progress/streaks";
import { pickReusableSession } from "../src/lib/session/reusable-session";

(async () => {

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Fake Supabase client that stores rows and applies .eq filters
class FakeSupabase {
  private sessionExercises: Map<string, SessionExercise[]> = new Map();
  private sessions: Map<string, { status: string; completed_at: string | null; duration_seconds: number | null }> = new Map();

  setSessionExercises(sessionId: string, exercises: SessionExercise[]) {
    this.sessionExercises.set(sessionId, exercises);
  }

  setSession(sessionId: string, status: string) {
    this.sessions.set(sessionId, { status, completed_at: null, duration_seconds: null });
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  from(table: string) {
    if (table === "session_exercises") {
      return {
        select: () => ({
          eq: (col: string, val: string) => {
            const exercises = this.sessionExercises.get(val) ?? [];
            return Promise.resolve({ data: exercises, error: null });
          },
        }),
      };
    }
    if (table === "sessions") {
      return {
        update: (values: { status: string; completed_at: string | null; duration_seconds: number }) => ({
          eq: (col1: string, val1: string) => ({
            eq: (col2: string, val2: string) => {
              const session = this.sessions.get(val1);
              if (session && session[col2 as keyof typeof session] === val2) {
                // Apply update
                Object.assign(session, values);
                return Promise.resolve({ error: null });
              }
              // .eq filter didn't match, no update
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
    }
    throw new Error(`Unknown table: ${table}`);
  }
}

console.log("\n1. decideAbandonStatus: working sets → completed");
{
  const exercises: SessionExercise[] = [
    {
      session_sets: [
        { id: "s1", is_warmup_set: true },
        { id: "s2", is_warmup_set: false }, // working set
      ],
    },
  ];
  const status = decideAbandonStatus(exercises);
  check("6 working sets → completed", status === "completed", status);
}

console.log("\n2. decideAbandonStatus: warm-up only → skipped");
{
  const exercises: SessionExercise[] = [
    {
      session_sets: [
        { id: "s1", is_warmup_set: true },
        { id: "s2", is_warmup_set: true },
      ],
    },
  ];
  const status = decideAbandonStatus(exercises);
  check("warm-up only → skipped", status === "skipped", status);
}

console.log("\n3. decideAbandonStatus: zero sets → skipped");
{
  const exercises: SessionExercise[] = [{ session_sets: [] }];
  const status = decideAbandonStatus(exercises);
  check("zero sets → skipped", status === "skipped", status);
}

console.log("\n4. abandonSessionCore: applies status and duration once");
{
  const fake = new FakeSupabase();
  fake.setSessionExercises("sess1", [
    {
      session_sets: [
        { id: "s1", is_warmup_set: false },
        { id: "s2", is_warmup_set: false },
      ],
    },
  ]);
  fake.setSession("sess1", "in_progress");

  await abandonSessionCore(fake as unknown as SupabaseClient, "sess1", 1234.5);
  
  const session = fake.getSession("sess1");
  check("status is completed", session?.status === "completed", session?.status);
  check("duration is 1235", session?.duration_seconds === 1235, String(session?.duration_seconds));
  check("completed_at is set", session?.completed_at !== null);
}

console.log("\n5. abandonSessionCore: second call is no-op");
{
  const fake = new FakeSupabase();
  fake.setSessionExercises("sess2", [
    { session_sets: [{ id: "s1", is_warmup_set: false }] },
  ]);
  fake.setSession("sess2", "in_progress");

  await abandonSessionCore(fake as unknown as SupabaseClient, "sess2", 600);
  const after1 = fake.getSession("sess2");
  
  await abandonSessionCore(fake as unknown as SupabaseClient, "sess2", 900); // retry with different duration
  const after2 = fake.getSession("sess2");
  
  check("duration unchanged on retry", after1?.duration_seconds === after2?.duration_seconds, `${after1?.duration_seconds} vs ${after2?.duration_seconds}`);
  check("still 600 seconds", after2?.duration_seconds === 600, String(after2?.duration_seconds));
}

console.log("\n6. abandonSessionCore: duration clamped to 0..6 hours");
{
  const fake1 = new FakeSupabase();
  fake1.setSessionExercises("neg", [{ session_sets: [{ id: "s1", is_warmup_set: false }] }]);
  fake1.setSession("neg", "in_progress");
  await abandonSessionCore(fake1 as unknown as SupabaseClient, "neg", -100);
  check("negative duration clamped to 0", fake1.getSession("neg")?.duration_seconds === 0, String(fake1.getSession("neg")?.duration_seconds));

  const fake2 = new FakeSupabase();
  fake2.setSessionExercises("huge", [{ session_sets: [{ id: "s1", is_warmup_set: false }] }]);
  fake2.setSession("huge", "in_progress");
  await abandonSessionCore(fake2 as unknown as SupabaseClient, "huge", 50000);
  check("50000 seconds clamped to 21600 (6 hours)", fake2.getSession("huge")?.duration_seconds === 21600, String(fake2.getSession("huge")?.duration_seconds));

  const fake3 = new FakeSupabase();
  fake3.setSessionExercises("frac", [{ session_sets: [{ id: "s1", is_warmup_set: false }] }]);
  fake3.setSession("frac", "in_progress");
  await abandonSessionCore(fake3 as unknown as SupabaseClient, "frac", 123.7);
  check("fractional seconds rounded", fake3.getSession("frac")?.duration_seconds === 124, String(fake3.getSession("frac")?.duration_seconds));
}

console.log("\n7. Early-ended completed session counts toward streak");
{
  const records = buildDayRecords({
    programs: [{ id: "p1", startedOn: "2026-09-08", endsOn: "2026-10-05" }],
    dayTypesByProgram: {
      p1: { 1: "weights", 2: "rest", 3: "weights", 4: "rest", 5: "rest", 6: "rest", 7: "rest" },
    },
    completedSessions: [
      // Monday weights, abandoned early but had working sets so it's completed
      { local_date: "2026-09-08", actual_type: "weights", status: "completed", working_set_count: 3 },
    ],
    today: "2026-09-08",
  });
  
  const s = computeStreaks(records, "2026-09-08");
  check("early-ended completed session: streak is 1", s.current === 1, `${s.current}`);
  check("early-ended completed session: days trained is 1", s.totalSessions === 1, `${s.totalSessions}`);
}

console.log("\n8. pickReusableSession: completed strength session not re-offered");
{
  const todayRows = [
    { id: "sess1", status: "completed" as const, actual_type: "weights" as const },
  ];
  const reusable = pickReusableSession(todayRows as unknown as Parameters<typeof pickReusableSession>[0], true);
  check("completed session not reused", reusable === undefined, reusable ? `got ${reusable.id}` : "");
}

console.log("\n9. pickReusableSession: skipped strength session IS reused when resume enabled");
{
  const todayRows = [
    { id: "sess2", status: "skipped" as const, actual_type: "weights" as const },
  ];
  const reusable = pickReusableSession(todayRows as unknown as Parameters<typeof pickReusableSession>[0], true);
  check("skipped strength session is reused", reusable?.id === "sess2", reusable?.id);
}

console.log("\n10. pickReusableSession: skipped yoga session NOT reused");
{
  const todayRows = [
    { id: "sess3", status: "skipped" as const, actual_type: "yoga" as const },
  ];
  const reusable = pickReusableSession(todayRows as unknown as Parameters<typeof pickReusableSession>[0], true);
  check("skipped yoga not reused", reusable === undefined, reusable ? `got ${reusable.id}` : "");
}

console.log("\n11. pickReusableSession: resume disabled → only planned reused");
{
  const todayRows = [
    { id: "sess4", status: "in_progress" as const, actual_type: "weights" as const },
    { id: "sess5", status: "planned" as const, actual_type: "weights" as const },
  ];
  const reusable = pickReusableSession(todayRows as unknown as Parameters<typeof pickReusableSession>[0], false);
  check("resume disabled: only planned", reusable?.id === "sess5", reusable?.id);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();
