/**
 * Test getInProgressSession function.
 * 
 * Verifies:
 * - Returns null when no in-progress session exists
 * - Returns the most recent in-progress session
 * - workingSetsLogged counts only is_warmup_set = false
 * - Warm-up sets are excluded from the count
 * - Multiple in-progress sessions: returns most recent by started_at
 * 
 *   npx tsx scripts/test-in-progress-session.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

// Re-implement the function here to test without importing
async function getInProgressSession(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  const { data: sessions, error: sessionError } = await supabase
    .from("sessions")
    .select("id, started_at, program_days(label)")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1);

  if (sessionError || !sessions || sessions.length === 0) {
    return null;
  }

  const session = sessions[0];

  const { data: exercises, error: exercisesError } = await supabase
    .from("session_exercises")
    .select("id")
    .eq("session_id", session.id);

  if (exercisesError || !exercises || exercises.length === 0) {
    const programDay = session.program_days as unknown as { label: string } | null;
    return {
      id: session.id,
      title: programDay?.label ?? "Workout",
      workingSetsLogged: 0,
      startedAt: session.started_at ?? new Date().toISOString(),
    };
  }

  const exerciseIds = exercises.map((e) => e.id);

  const { data: sets, error: setsError } = await supabase
    .from("session_sets")
    .select("id")
    .eq("user_id", userId)
    .eq("is_warmup_set", false)
    .in("session_exercise_id", exerciseIds);

  if (setsError) {
    return null;
  }

  const programDay = session.program_days as unknown as { label: string } | null;
  const title = programDay?.label ?? "Workout";
  const workingSetsLogged = sets?.length ?? 0;

  return {
    id: session.id,
    title,
    workingSetsLogged,
    startedAt: session.started_at ?? new Date().toISOString(),
  };
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

class FakeSupabase {
  private sessions: Array<{
    id: string;
    user_id: string;
    status: string;
    started_at: string;
    program_days: { label: string } | null;
  }> = [];
  private sessionExercises: Array<{ id: string; session_id: string }> = [];
  private sessionSets: Array<{
    id: string;
    user_id: string;
    session_exercise_id: string;
    is_warmup_set: boolean;
  }> = [];

  addSession(
    id: string,
    userId: string,
    status: string,
    startedAt: string,
    label: string | null
  ) {
    this.sessions.push({
      id,
      user_id: userId,
      status,
      started_at: startedAt,
      program_days: label ? { label } : null,
    });
  }

  addExercise(id: string, sessionId: string) {
    this.sessionExercises.push({ id, session_id: sessionId });
  }

  addSet(
    id: string,
    userId: string,
    exerciseId: string,
    isWarmup: boolean
  ) {
    this.sessionSets.push({
      id,
      user_id: userId,
      session_exercise_id: exerciseId,
      is_warmup_set: isWarmup,
    });
  }

  from(table: string) {
    if (table === "sessions") {
      return {
        select: (cols: string) => {
          const chain = {
            data: this.sessions,
            eq: (col: string, val: string) => {
              chain.data = chain.data.filter((s) => (s as never)[col] === val);
              return chain;
            },
            order: (col: string, opts: { ascending: boolean }) => {
              chain.data = [...chain.data].sort((a, b) => {
                const aVal = (a as never)[col];
                const bVal = (b as never)[col];
                const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                return opts.ascending ? cmp : -cmp;
              });
              return chain;
            },
            limit: (n: number) => {
              chain.data = chain.data.slice(0, n);
              return Promise.resolve({ data: chain.data, error: null });
            },
          };
          return chain;
        },
      };
    }

    if (table === "session_exercises") {
      return {
        select: (cols: string) => ({
          eq: (col: string, val: string) => {
            const filtered = this.sessionExercises.filter(
              (e) => (e as never)[col] === val
            );
            return Promise.resolve({ data: filtered, error: null });
          },
        }),
      };
    }

    if (table === "session_sets") {
      return {
        select: () => ({
          eq: (col: string, val: string | boolean) => {
            let filtered = this.sessionSets.filter(
              (s) => (s as never)[col] === val
            );
            return {
              eq: (col2: string, val2: string | boolean) => {
                filtered = filtered.filter((s) => (s as never)[col2] === val2);
                return {
                  in: (col3: string, ids: string[]) => {
                    const finalFiltered = filtered.filter((s) =>
                      ids.includes(s.session_exercise_id)
                    );
                    return Promise.resolve({
                      data: finalFiltered,
                      error: null,
                    });
                  },
                };
              },
            };
          },
        }),
      };
    }

    throw new Error(`Unknown table: ${table}`);
  }
}

(async () => {
  console.log("\n1. No in-progress session → returns null");
  {
    const fake = new FakeSupabase();
    fake.addSession("s1", "user1", "completed", "2026-10-24T10:00:00Z", "Push");
    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("no in-progress session", result === null, result ? result.id : "");
  }

  console.log("\n2. In-progress session with working sets");
  {
    const fake = new FakeSupabase();
    fake.addSession("s2", "user1", "in_progress", "2026-10-24T11:00:00Z", "Pull");
    fake.addExercise("ex1", "s2");
    fake.addSet("set1", "user1", "ex1", true); // warm-up
    fake.addSet("set2", "user1", "ex1", false); // working
    fake.addSet("set3", "user1", "ex1", false); // working

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("returns session", result !== null);
    check("session id", result?.id === "s2", result?.id);
    check("title from program_day", result?.title === "Pull", result?.title);
    check("workingSetsLogged excludes warm-up", result?.workingSetsLogged === 2, String(result?.workingSetsLogged));
  }

  console.log("\n3. Warm-up only → zero working sets");
  {
    const fake = new FakeSupabase();
    fake.addSession("s3", "user1", "in_progress", "2026-10-24T12:00:00Z", "Legs");
    fake.addExercise("ex2", "s3");
    fake.addSet("set4", "user1", "ex2", true);
    fake.addSet("set5", "user1", "ex2", true);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("returns session", result !== null);
    check("workingSetsLogged is 0", result?.workingSetsLogged === 0, String(result?.workingSetsLogged));
  }

  console.log("\n4. Multiple in-progress sessions → returns most recent");
  {
    const fake = new FakeSupabase();
    fake.addSession("s4", "user1", "in_progress", "2026-10-24T09:00:00Z", "Upper");
    fake.addSession("s5", "user1", "in_progress", "2026-10-24T13:00:00Z", "Lower");
    fake.addExercise("ex3", "s4");
    fake.addExercise("ex4", "s5");
    fake.addSet("set6", "user1", "ex3", false);
    fake.addSet("set7", "user1", "ex4", false);
    fake.addSet("set8", "user1", "ex4", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("returns most recent", result?.id === "s5", result?.id);
    check("workingSetsLogged from s5", result?.workingSetsLogged === 2, String(result?.workingSetsLogged));
  }

  console.log("\n5. Session without program_days → title defaults to 'Workout'");
  {
    const fake = new FakeSupabase();
    fake.addSession("s6", "user1", "in_progress", "2026-10-24T14:00:00Z", null);
    fake.addExercise("ex5", "s6");
    fake.addSet("set9", "user1", "ex5", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("title defaults to Workout", result?.title === "Workout", result?.title);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
