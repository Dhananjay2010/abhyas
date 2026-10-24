/**
 * L2: Test the REAL getInProgressSession function.
 * 
 * Verifies:
 * - M2: Only today's in_progress session is returned (timezone-aware)
 * - Returns null when no in-progress session exists today
 * - Returns null when in_progress session is from yesterday
 * - Returns the most recent in-progress session for today
 * - workingSetsLogged counts only is_warmup_set = false
 * - Warm-up sets are excluded from the count
 * - Multiple in-progress sessions: returns most recent by started_at
 * - Timezone resolution works correctly
 * - 0-set sessions are returned (L3)
 * 
 *   npx tsx scripts/test-in-progress-session.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { getInProgressSession } from "../src/lib/session/in-progress";
import { localDateString } from "../src/lib/dates";

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
    local_date: string;
    program_days: { label: string } | null;
  }> = [];
  private profiles: Array<{
    id: string;
    timezone: string | null;
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
    localDate: string,
    label: string | null
  ) {
    this.sessions.push({
      id,
      user_id: userId,
      status,
      started_at: startedAt,
      local_date: localDate,
      program_days: label ? { label } : null,
    });
  }

  addProfile(userId: string, timezone: string | null) {
    this.profiles.push({
      id: userId,
      timezone,
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
    if (table === "profiles") {
      return {
        select: (cols: string) => ({
          eq: (col: string, val: string) => {
            const filtered = this.profiles.filter(
              (p) => (p as never)[col] === val
            );
            return {
              single: () =>
                Promise.resolve({
                  data: filtered[0] || null,
                  error: null,
                }),
            };
          },
        }),
      };
    }

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
  const today = localDateString("UTC");
  const yesterday = localDateString("UTC", new Date(Date.now() - 86400000));

  console.log("\n1. M2: No in-progress session today → returns null");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    fake.addSession("s1", "user1", "completed", "2026-10-24T10:00:00Z", today, "Push");
    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("no in-progress session", result === null, result ? result.id : "");
  }

  console.log("\n2. M2: In-progress session from yesterday → returns null");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    fake.addSession("s2", "user1", "in_progress", "2026-10-23T11:00:00Z", yesterday, "Pull");
    fake.addExercise("ex1", "s2");
    fake.addSet("set1", "user1", "ex1", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("past-day in-progress not returned", result === null, result ? result.id : "");
  }

  console.log("\n3. In-progress session today with working sets");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    fake.addSession("s3", "user1", "in_progress", "2026-10-24T11:00:00Z", today, "Pull");
    fake.addExercise("ex2", "s3");
    fake.addSet("set2", "user1", "ex2", true); // warm-up
    fake.addSet("set3", "user1", "ex2", false); // working
    fake.addSet("set4", "user1", "ex2", false); // working

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("returns session", result !== null);
    check("session id", result?.id === "s3", result?.id);
    check("title from program_day", result?.title === "Pull", result?.title);
    check("workingSetsLogged excludes warm-up", result?.workingSetsLogged === 2, String(result?.workingSetsLogged));
  }

  console.log("\n4. L3: 0-set in-progress session today is returned");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    fake.addSession("s4", "user1", "in_progress", "2026-10-24T12:00:00Z", today, "Legs");
    fake.addExercise("ex3", "s4");

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("returns session", result !== null);
    check("workingSetsLogged is 0", result?.workingSetsLogged === 0, String(result?.workingSetsLogged));
  }

  console.log("\n5. Multiple in-progress sessions today → returns most recent");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    fake.addSession("s5", "user1", "in_progress", "2026-10-24T09:00:00Z", today, "Upper");
    fake.addSession("s6", "user1", "in_progress", "2026-10-24T13:00:00Z", today, "Lower");
    fake.addExercise("ex4", "s5");
    fake.addExercise("ex5", "s6");
    fake.addSet("set5", "user1", "ex4", false);
    fake.addSet("set6", "user1", "ex5", false);
    fake.addSet("set7", "user1", "ex5", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("returns most recent", result?.id === "s6", result?.id);
    check("workingSetsLogged from s6", result?.workingSetsLogged === 2, String(result?.workingSetsLogged));
  }

  console.log("\n6. Session without program_days → title defaults to 'Workout'");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    fake.addSession("s7", "user1", "in_progress", "2026-10-24T14:00:00Z", today, null);
    fake.addExercise("ex6", "s7");
    fake.addSet("set8", "user1", "ex6", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("title defaults to Workout", result?.title === "Workout", result?.title);
  }

  console.log("\n7. Timezone resolution: profile timezone is used");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "America/New_York");
    const nyToday = localDateString("America/New_York");
    fake.addSession("s8", "user1", "in_progress", "2026-10-24T14:00:00Z", nyToday, "Push");
    fake.addExercise("ex7", "s8");
    fake.addSet("set9", "user1", "ex7", false);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1",
      "UTC"
    );
    check("returns session with NY timezone", result !== null);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
