/**
 * L2: Test the REAL getInProgressSession function.
 * 
 * Verifies:
 * - Returns the user's in_progress session regardless of local_date
 * - Returns null when no in-progress session exists
 * - Returns null for stale sessions (>= 6h inactive per #111)
 * - Returns sessions that are still active even after midnight
 * - workingSetsLogged counts only is_warmup_set = false
 * - Warm-up sets are excluded from the count
 * - Multiple in-progress sessions: returns most recent by started_at (nulls last)
 * - 0-set sessions are returned (L3)
 * - Completed/skipped/planned sessions are never returned
 * 
 *   npx tsx scripts/test-in-progress-session.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { getInProgressSession } from "../src/lib/session/in-progress";
import { isSessionStale, STALE_INACTIVITY_THRESHOLD_SECONDS } from "../src/lib/session/close-stale";
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
    started_at: string | null;
    local_date: string;
    actual_type: string | null;
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
    session_id: string;
    session_exercise_id: string;
    is_warmup_set: boolean;
    completed_at: string | null;
  }> = [];

  addProfile(userId: string, timezone: string | null) {
    this.profiles.push({
      id: userId,
      timezone,
    });
  }

  addSession(
    id: string,
    userId: string,
    status: string,
    startedAt: string | null,
    localDate: string,
    actualType: string | null,
    label: string | null
  ) {
    this.sessions.push({
      id,
      user_id: userId,
      status,
      started_at: startedAt,
      local_date: localDate,
      actual_type: actualType,
      program_days: label ? { label } : null,
    });
  }

  addExercise(id: string, sessionId: string) {
    this.sessionExercises.push({ id, session_id: sessionId });
  }

  addSet(
    id: string,
    userId: string,
    sessionId: string,
    exerciseId: string,
    isWarmup: boolean,
    completedAt: string | null
  ) {
    this.sessionSets.push({
      id,
      user_id: userId,
      session_id: sessionId,
      session_exercise_id: exerciseId,
      is_warmup_set: isWarmup,
      completed_at: completedAt,
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
            in: (col: string, vals: string[]) => {
              chain.data = chain.data.filter((s) => vals.includes((s as never)[col]));
              return chain;
            },
            not: (col: string, op: string, val: null) => {
              if (op === "is") {
                chain.data = chain.data.filter((s) => (s as never)[col] !== null);
              }
              return chain;
            },
            order: (col: string, opts: { ascending: boolean; nullsFirst?: boolean }) => {
              chain.data = [...chain.data].sort((a, b) => {
                const aVal = (a as never)[col];
                const bVal = (b as never)[col];
                
                const nullsFirst = opts.nullsFirst !== false;
                if (aVal == null && bVal == null) return 0;
                if (aVal == null) return nullsFirst ? -1 : 1;
                if (bVal == null) return nullsFirst ? 1 : -1;
                
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
        select: () => {
          const chain = {
            data: this.sessionSets,
            eq: (col: string, val: string | boolean) => {
              chain.data = chain.data.filter((s) => (s as never)[col] === val);
              return chain;
            },
            in: (col: string, ids: string[]) => {
              chain.data = chain.data.filter((s) => ids.includes(s.session_exercise_id));
              return chain;
            },
            order: (col: string, opts: { ascending: boolean; nullsFirst?: boolean }) => {
              chain.data = [...chain.data].sort((a, b) => {
                const aVal = (a as never)[col];
                const bVal = (b as never)[col];
                
                const nullsFirst = opts.nullsFirst !== false;
                if (aVal == null && bVal == null) return 0;
                if (aVal == null) return nullsFirst ? -1 : 1;
                if (bVal == null) return nullsFirst ? 1 : -1;
                
                const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                return opts.ascending ? cmp : -cmp;
              });
              return chain;
            },
            limit: (n: number) => {
              chain.data = chain.data.slice(0, n);
              return Promise.resolve({
                data: chain.data,
                error: null,
              });
            },
          };
          return chain;
        },
      };
    }

    throw new Error(`Unknown table: ${table}`);
  }
}

(async () => {
  const today = localDateString("UTC");
  const yesterday = localDateString("UTC", new Date(Date.now() - 86400000));

  console.log("\n1. No in-progress session → returns null");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    fake.addProfile("user1", "UTC");
    fake.addSession("s1", "user1", "completed", "2026-10-24T10:00:00Z", today, "weights", "Push");
    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("no in-progress session", result === null, result ? result.id : "");
  }

  console.log("\n2. In-progress session from yesterday → IS returned if not stale");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    // Session started 1h ago, last set 10min ago - not stale
    const now = Date.now();
    const oneHourAgo = new Date(now - 3600000).toISOString();
    const tenMinAgo = new Date(now - 600000).toISOString();
    
    fake.addSession("s2", "user1", "in_progress", oneHourAgo, yesterday, "weights", "Pull");
    fake.addExercise("ex1", "s2");
    fake.addSet("set1", "user1", "s2", "ex1", false, tenMinAgo);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("past-day in-progress IS returned when not stale", result !== null, result ? result.id : "null");
    check("correct session id", result?.id === "s2", result?.id);
    check("correct working sets", result?.workingSetsLogged === 1, String(result?.workingSetsLogged));
  }

  console.log("\n3. NEW: Stale session (14h idle) → returns null");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    // Session started 14h ago, last set 14h ago - stale
    const fourteenHoursAgo = new Date(Date.now() - 14 * 3600000).toISOString();
    
    fake.addSession("s3", "user1", "in_progress", fourteenHoursAgo, yesterday, "weights", "Legs");
    fake.addExercise("ex2", "s3");
    fake.addSet("set2", "user1", "s3", "ex2", false, fourteenHoursAgo);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("stale session (14h) returns null", result === null, result ? `got ${result.id}` : "");
  }

  console.log("\n4. NEW: Session started before midnight, set 10min ago → IS returned");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    // Session started 50min ago (before midnight), last set 10min ago
    const fiftyMinAgo = new Date(Date.now() - 50 * 60000).toISOString();
    const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
    const yesterdayIST = "2026-10-23"; // Simulating yesterday's date
    
    fake.addSession("s4", "user1", "in_progress", fiftyMinAgo, yesterdayIST, "weights", "Late Night Push");
    fake.addExercise("ex3", "s4");
    fake.addSet("set3", "user1", "s4", "ex3", false, tenMinAgo);
    fake.addSet("set4", "user1", "s4", "ex3", false, tenMinAgo);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("returns session after midnight", result !== null);
    check("correct session id", result?.id === "s4", result?.id);
    check("correct title", result?.title === "Late Night Push", result?.title);
    check("correct set count", result?.workingSetsLogged === 2, String(result?.workingSetsLogged));
  }

  console.log("\n5. In-progress session with working sets");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    const recentTime = new Date(Date.now() - 600000).toISOString(); // 10min ago
    fake.addSession("s5", "user1", "in_progress", recentTime, today, "weights", "Pull");
    fake.addExercise("ex4", "s5");
    fake.addSet("set5", "user1", "s5", "ex4", true, recentTime); // warm-up
    fake.addSet("set6", "user1", "s5", "ex4", false, recentTime); // working
    fake.addSet("set7", "user1", "s5", "ex4", false, recentTime); // working

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("returns session", result !== null);
    check("session id", result?.id === "s5", result?.id);
    check("title from program_day", result?.title === "Pull", result?.title);
    check("workingSetsLogged excludes warm-up", result?.workingSetsLogged === 2, String(result?.workingSetsLogged));
  }

  console.log("\n6. L3: 0-set in-progress session is returned if not stale");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    const recentTime = new Date(Date.now() - 600000).toISOString();
    fake.addSession("s6", "user1", "in_progress", recentTime, today, "weights", "Legs");
    fake.addExercise("ex5", "s6");

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("returns session", result !== null);
    check("workingSetsLogged is 0", result?.workingSetsLogged === 0, String(result?.workingSetsLogged));
  }

  console.log("\n7. Multiple in-progress sessions → returns most recent by started_at");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const thirtyMinAgo = new Date(Date.now() - 1800000).toISOString();
    
    fake.addSession("s7", "user1", "in_progress", oneHourAgo, today, "weights", "Upper");
    fake.addSession("s8", "user1", "in_progress", thirtyMinAgo, today, "weights", "Lower");
    fake.addExercise("ex6", "s7");
    fake.addExercise("ex7", "s8");
    fake.addSet("set8", "user1", "s7", "ex6", false, oneHourAgo);
    fake.addSet("set9", "user1", "s8", "ex7", false, thirtyMinAgo);
    fake.addSet("set10", "user1", "s8", "ex7", false, thirtyMinAgo);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("returns most recent", result?.id === "s8", result?.id);
    check("workingSetsLogged from s8", result?.workingSetsLogged === 2, String(result?.workingSetsLogged));
  }

  console.log("\n8. Session without program_days → title defaults to 'Workout'");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    const recentTime = new Date(Date.now() - 600000).toISOString();
    fake.addSession("s9", "user1", "in_progress", recentTime, today, "weights", null);
    fake.addExercise("ex8", "s9");
    fake.addSet("set11", "user1", "s9", "ex8", false, recentTime);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("title defaults to Workout", result?.title === "Workout", result?.title);
  }

  console.log("\n9. Completed/skipped/planned sessions are never returned");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    const recentTime = new Date(Date.now() - 600000).toISOString();
    fake.addSession("s10", "user1", "completed", recentTime, today, "weights", "Completed");
    fake.addSession("s11", "user1", "skipped", recentTime, today, "weights", "Skipped");
    fake.addSession("s12", "user1", "planned", recentTime, today, "weights", "Planned");
    fake.addExercise("ex9", "s10");
    fake.addExercise("ex10", "s11");
    fake.addSet("set12", "user1", "s10", "ex9", false, recentTime);
    fake.addSet("set13", "user1", "s11", "ex10", false, recentTime);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("returns null for non-in_progress sessions", result === null);
  }

  console.log("\n10. Null started_at handled correctly (nulls last in order)");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    const recentTime = new Date(Date.now() - 600000).toISOString();
    fake.addSession("s13", "user1", "in_progress", null, today, "weights", "Null Started");
    fake.addSession("s14", "user1", "in_progress", recentTime, today, "weights", "Real Started");
    fake.addExercise("ex11", "s13");
    fake.addExercise("ex12", "s14");
    fake.addSet("set14", "user1", "s13", "ex11", false, recentTime);
    fake.addSet("set15", "user1", "s14", "ex12", false, recentTime);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("returns session with real started_at (nulls last)", result?.id === "s14", result?.id);
  }

  console.log("\n11. NEW: Session started 7h ago with warm-up 5min ago → IS returned");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    const sevenHoursAgo = new Date(Date.now() - 7 * 3600000).toISOString();
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    
    fake.addSession("s15", "user1", "in_progress", sevenHoursAgo, today, "weights", "Push");
    fake.addExercise("ex15", "s15");
    // Warm-up set 5min ago - this is recent activity even though it's a warm-up
    fake.addSet("set19", "user1", "s15", "ex15", true, fiveMinAgo);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("session with recent warm-up is returned", result !== null, result ? result.id : "null");
    check("correct session id", result?.id === "s15", result?.id);
    check("working sets count is 0 (warm-up excluded)", result?.workingSetsLogged === 0, String(result?.workingSetsLogged));
  }

  console.log("\n12. NEW: Completed strength session does NOT hide in_progress session");
  {
    const fake = new FakeSupabase();
    fake.addProfile("user1", "UTC");
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const thirtyMinAgo = new Date(Date.now() - 1800000).toISOString();
    
    // in_progress session started 1h ago
    fake.addSession("s16", "user1", "in_progress", oneHourAgo, today, "weights", "Morning");
    fake.addExercise("ex16", "s16");
    fake.addSet("set20", "user1", "s16", "ex16", false, oneHourAgo);
    
    // Completed strength session started 30min ago (newer, but completed so not "open")
    fake.addSession("s17", "user1", "completed", thirtyMinAgo, today, "weights", "Afternoon");
    fake.addExercise("ex17", "s17");
    fake.addSet("set21", "user1", "s17", "ex17", false, thirtyMinAgo);

    const result = await getInProgressSession(
      fake as unknown as SupabaseClient<Database>,
      "user1"
    );
    check("in_progress session is returned", result !== null, result ? result.id : "null");
    check("correct session id (not hidden by completed)", result?.id === "s16", result?.id);
  }

  console.log("\n13. UNIT: isSessionStale with various scenarios");
  {
    const now = Date.now();
    const today = localDateString("UTC");
    const yesterday = localDateString("UTC", new Date(now - 86400000));
    
    // 13a: Session with 7h inactivity is stale
    const sevenHoursAgo = new Date(now - 7 * 3600000).toISOString();
    const stale7h = isSessionStale({
      startedAt: sevenHoursAgo,
      lastSetCompletedAt: sevenHoursAgo,
      localDate: today,
      status: "in_progress",
      actualType: "weights",
      newestStrengthStartedAt: null,
      today,
      nowMs: now,
    });
    check("13a: 7h inactive is stale", stale7h === true);
    
    // 13b: Session with 5h 50min inactivity is NOT stale
    const fiveHoursFiftyMin = new Date(now - (STALE_INACTIVITY_THRESHOLD_SECONDS - 600) * 1000).toISOString();
    const notStale = isSessionStale({
      startedAt: fiveHoursFiftyMin,
      lastSetCompletedAt: fiveHoursFiftyMin,
      localDate: today,
      status: "in_progress",
      actualType: "weights",
      newestStrengthStartedAt: null,
      today,
      nowMs: now,
    });
    check("13b: 5h 50min inactive is NOT stale", notStale === false);
    
    // 13c: Strength session superseded by newer strength session is stale
    const oneHourAgo = new Date(now - 3600000).toISOString();
    const thirtyMinAgo = new Date(now - 1800000).toISOString();
    const superseded = isSessionStale({
      startedAt: oneHourAgo,
      lastSetCompletedAt: oneHourAgo,
      localDate: today,
      status: "in_progress",
      actualType: "weights",
      newestStrengthStartedAt: thirtyMinAgo,
      today,
      nowMs: now,
    });
    check("13c: superseded strength session is stale", superseded === true);
    
    // 13d: No started_at, no sets, in_progress is stale
    const noStartedAt = isSessionStale({
      startedAt: null,
      lastSetCompletedAt: null,
      localDate: today,
      status: "in_progress",
      actualType: "weights",
      newestStrengthStartedAt: null,
      today,
      nowMs: now,
    });
    check("13d: no started_at, no sets, in_progress is stale", noStartedAt === true);
    
    // 13e: No started_at, but has recent set, NOT stale
    const recentSet = new Date(now - 600000).toISOString();
    const noStartedAtButRecentSet = isSessionStale({
      startedAt: null,
      lastSetCompletedAt: recentSet,
      localDate: today,
      status: "in_progress",
      actualType: "weights",
      newestStrengthStartedAt: null,
      today,
      nowMs: now,
    });
    check("13e: no started_at but recent set is NOT stale", noStartedAtButRecentSet === false);
    
    // 13f: Planned session from yesterday is stale
    const plannedYesterday = isSessionStale({
      startedAt: null,
      lastSetCompletedAt: null,
      localDate: yesterday,
      status: "planned",
      actualType: "weights",
      newestStrengthStartedAt: null,
      today,
      nowMs: now,
    });
    check("13f: planned session from yesterday is stale", plannedYesterday === true);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
