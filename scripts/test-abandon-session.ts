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

import { decideAbandonStatus, abandonSessionCore, type SessionExercise } from "../src/lib/session/abandon-session";
import { buildDayRecords, computeStreaks } from "../src/lib/progress/streaks";
import { pickReusableSession } from "../src/lib/session/reusable-session";

(async () => {

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Fake deps builder
function makeFakeAbandonDeps(
  exercises: SessionExercise[],
  initialStatus: "in_progress" | "completed" | "skipped"
) {
  const sessionState: {
    status: "in_progress" | "completed" | "skipped";
    completed_at: string | null;
    duration_seconds: number | null;
  } = {
    status: initialStatus,
    completed_at: null,
    duration_seconds: null,
  };

  return {
    getSession: () => sessionState,
    async loadExercises() {
      return { data: exercises, error: null };
    },
    async updateSession(_sessionId: string, patch: { status: "completed" | "skipped"; completed_at: string | null; duration_seconds: number }) {
      // Only update if still in_progress (idempotency guard)
      if (sessionState.status === "in_progress") {
        Object.assign(sessionState, patch);
        return { error: null, updatedCount: 1 };
      }
      return { error: null, updatedCount: 0 };
    },
    async loadSessionStatus() {
      return { data: { status: sessionState.status }, error: null };
    },
    async loadExercisesForUpdate() {
      return { data: [], error: null };
    },
    async updateExerciseStatus() {
      return { error: null };
    },
  };
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
  const exercises = [
    {
      session_sets: [
        { id: "s1", is_warmup_set: false },
        { id: "s2", is_warmup_set: false },
      ],
    },
  ];
  const fake = makeFakeAbandonDeps(exercises, "in_progress");

  await abandonSessionCore(fake, "sess1", 1234.5);
  
  const session = fake.getSession();
  check("status is completed", session?.status === "completed", session?.status);
  check("duration is 1235", session?.duration_seconds === 1235, String(session?.duration_seconds));
  check("completed_at is set", session?.completed_at !== null);
}

console.log("\n5. abandonSessionCore: second call is no-op");
{
  const exercises = [
    { session_sets: [{ id: "s1", is_warmup_set: false }] },
  ];
  const fake = makeFakeAbandonDeps(exercises, "in_progress");

  await abandonSessionCore(fake, "sess2", 600);
  const after1 = fake.getSession();
  
  await abandonSessionCore(fake, "sess2", 900); // retry with different duration
  const after2 = fake.getSession();
  
  check("duration unchanged on retry", after1?.duration_seconds === after2?.duration_seconds, `${after1?.duration_seconds} vs ${after2?.duration_seconds}`);
  check("still 600 seconds", after2?.duration_seconds === 600, String(after2?.duration_seconds));
}

console.log("\n6. abandonSessionCore: duration clamped to 0..6 hours");
{
  const exercises = [{ session_sets: [{ id: "s1", is_warmup_set: false }] }];
  
  const fake1 = makeFakeAbandonDeps(exercises, "in_progress");
  await abandonSessionCore(fake1, "neg", -100);
  check("negative duration clamped to 0", fake1.getSession()?.duration_seconds === 0, String(fake1.getSession()?.duration_seconds));

  const fake2 = makeFakeAbandonDeps(exercises, "in_progress");
  await abandonSessionCore(fake2, "huge", 50000);
  check("50000 seconds clamped to 21600 (6 hours)", fake2.getSession()?.duration_seconds === 21600, String(fake2.getSession()?.duration_seconds));

  const fake3 = makeFakeAbandonDeps(exercises, "in_progress");
  await abandonSessionCore(fake3, "frac", 123.7);
  check("fractional seconds rounded", fake3.getSession()?.duration_seconds === 124, String(fake3.getSession()?.duration_seconds));
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
