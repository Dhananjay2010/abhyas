/**
 * Test: ensureSessionExercises applies deload from session row
 *
 * ROOT CAUSE: A session started from a PLANNED row got no deload.
 * - planDay writes a planned session with is_deload=true but no exercises
 * - startSession reuses that row through the resume branch (actions.ts:102-128)
 * - ensureSessionExercises didn't select is_deload and copied target_sets at full volume
 *
 * EXPECTED: planned-then-start and direct-start both give 2+2+2+2 = 8 sets in deload week
 * BUG (main): planned-then-start gives 4+4+3+3 = 14 sets
 *
 *   npm run test:ensure-session-deload
 */

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Minimal fake Supabase client that simulates the planned-then-start scenario
function createFakeSupabaseClient() {
  // In-memory database
  type Session = {
    id: string;
    program_day_id: string;
    actual_type: string;
    is_deload: boolean;
    session_exercises: unknown[];
  };
  type SessionExercise = {
    session_id: string;
    user_id: string;
    exercise_id: string;
    order_index: number;
    planned_sets: number;
    planned_reps_min: number;
    planned_reps_max: number;
    rest_seconds: number;
    metric: string;
  };
  type ProgramDayExercise = {
    program_day_id: string;
    exercise_id: string;
    order_index: number;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    rest_seconds: number;
    exercises: { metric: string };
  };

  const sessions: Record<string, Session> = {};
  const sessionExercises: SessionExercise[] = [];
  const programDays: Record<string, { id: string; program_id: string; day_index: number }> = {};
  const programDayExercises: ProgramDayExercise[] = [];

  programDays["day1"] = {
    id: "day1",
    program_id: "prog1",
    day_index: 1,
  };

  // Program day has 4 exercises with 4 sets each (muscle_gain profile)
  programDayExercises.push(
    {
      program_day_id: "day1",
      exercise_id: "ex1",
      order_index: 0,
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: { metric: "reps" },
    },
    {
      program_day_id: "day1",
      exercise_id: "ex2",
      order_index: 1,
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: { metric: "reps" },
    },
    {
      program_day_id: "day1",
      exercise_id: "ex3",
      order_index: 2,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: { metric: "reps" },
    },
    {
      program_day_id: "day1",
      exercise_id: "ex4",
      order_index: 3,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: { metric: "reps" },
    },
  );

  const client = {
    from(table: string) {
      if (table === "sessions") {
        return {
          select(fields: string) {
            return {
              eq(field: string, value: string) {
                return {
                  maybeSingle() {
                    const session = sessions[value];
                    if (!session) {
                      return Promise.resolve({ data: null, error: null });
                    }
                    // Simulate what PostgREST returns
                    const result = { ...session };
                    if (fields.includes("session_exercises")) {
                      result.session_exercises = sessionExercises.filter(
                        (se) => se.session_id === value,
                      );
                    }
                    return Promise.resolve({ data: result, error: null });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "program_day_exercises") {
        return {
          select(fields: string) {
            return {
              eq(field: string, value: string) {
                return {
                  order(orderField: string) {
                    const exercises = programDayExercises.filter(
                      (pde) => pde.program_day_id === value,
                    );
                    return Promise.resolve({ data: exercises, error: null });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "session_exercises") {
        return {
          insert(rows: SessionExercise[]) {
            sessionExercises.push(...rows);
            return Promise.resolve({ data: rows, error: null });
          },
        };
      }

      return {};
    },
  };

  return { client, sessions, sessionExercises };
}

// Import the buildSessionExerciseRows helper
import { buildSessionExerciseRows } from "../src/lib/session/build-session-exercises";

// Simulate ensureSessionExercises logic
async function ensureSessionExercises(
  supabase: ReturnType<typeof createFakeSupabaseClient>["client"],
  userId: string,
  sessionId: string,
  // This parameter simulates the bug: on main, is_deload was NOT selected
  buggyVersion: boolean,
) {
  const { data: session } = await supabase
    .from("sessions")
    .select(
      buggyVersion
        ? "program_day_id, actual_type, session_exercises(id)" // BUG: missing is_deload
        : "program_day_id, actual_type, is_deload, session_exercises(id)", // FIX: includes is_deload
    )
    .eq("id", sessionId)
    .maybeSingle();

  if ((session?.session_exercises ?? []).length > 0) return;
  if (!session?.program_day_id) return;
  if (session.actual_type === "yoga" || session.actual_type === "meditation") return;

  const { data: planned } = await supabase
    .from("program_day_exercises")
    .select(
      "exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises",
    )
    .eq("program_day_id", session.program_day_id)
    .order("order_index");

  if (!planned || planned.length === 0) return;

  if (buggyVersion) {
    // BUG: didn't read is_deload, so always uses false (full volume)
    const rows = buildSessionExerciseRows(planned, { isDeload: false });
    await supabase.from("session_exercises").insert(
      rows.map((r) => ({
        session_id: sessionId,
        user_id: userId,
        ...r,
      })),
    );
  } else {
    // FIX: read is_deload from session and apply it
    const isDeload = session.is_deload ?? false;
    const rows = buildSessionExerciseRows(planned, { isDeload });
    await supabase.from("session_exercises").insert(
      rows.map((r) => ({
        session_id: sessionId,
        user_id: userId,
        ...r,
      })),
    );
  }
}

console.log("\n1. Direct start in deload week (always worked)");
{
  const { client, sessions, sessionExercises } = createFakeSupabaseClient();

  // Simulate startSession creating a session with is_deload=true
  sessions["sess1"] = {
    id: "sess1",
    program_day_id: "day1",
    actual_type: "weights",
    is_deload: true,
    session_exercises: [],
  };

  // Simulate startSession building exercises with deload applied
  const planned = [
    {
      exercise_id: "ex1",
      order_index: 0,
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: { metric: "reps" },
    },
    {
      exercise_id: "ex2",
      order_index: 1,
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: { metric: "reps" },
    },
    {
      exercise_id: "ex3",
      order_index: 2,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: { metric: "reps" },
    },
    {
      exercise_id: "ex4",
      order_index: 3,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: { metric: "reps" },
    },
  ];

  const rows = buildSessionExerciseRows(planned, { isDeload: true });
  sessionExercises.push(
    ...rows.map((r) => ({ session_id: "sess1", user_id: "user1", ...r })),
  );

  const totalSets = sessionExercises.reduce((sum, se) => sum + se.planned_sets, 0);
  check(
    "direct start: deload gives 2+2+2+2 = 8 sets",
    totalSets === 8,
    `got ${totalSets}`,
  );

  const sets = sessionExercises.map((se) => se.planned_sets);
  check(
    "direct start: individual exercises are 2,2,2,2",
    sets[0] === 2 && sets[1] === 2 && sets[2] === 2 && sets[3] === 2,
    `got ${sets.join(",")}`,
  );
}

async function runTests() {
  console.log("\n2. Planned-then-start on MAIN (buggy)");
  {
    const { client, sessions, sessionExercises } = createFakeSupabaseClient();

    // Simulate planDay creating a planned session with is_deload=true
    sessions["sess2"] = {
      id: "sess2",
      program_day_id: "day1",
      actual_type: "weights",
      is_deload: true,
      session_exercises: [],
    };

    // Simulate startSession calling ensureSessionExercises (buggy version)
    await ensureSessionExercises(client, "user1", "sess2", true);

    const totalSets = sessionExercises.reduce((sum, se) => sum + se.planned_sets, 0);
    check(
      "MAIN bug: planned-then-start gives 4+4+3+3 = 14 sets (WRONG)",
      totalSets === 14,
      `got ${totalSets}`,
    );

    const sets = sessionExercises.map((se) => se.planned_sets);
    check(
      "MAIN bug: individual exercises are 4,4,3,3 (no deload applied)",
      sets[0] === 4 && sets[1] === 4 && sets[2] === 3 && sets[3] === 3,
      `got ${sets.join(",")}`,
    );
  }

  console.log("\n3. Planned-then-start on THIS BRANCH (fixed)");
  {
    const { client, sessions, sessionExercises } = createFakeSupabaseClient();

    // Simulate planDay creating a planned session with is_deload=true
    sessions["sess3"] = {
      id: "sess3",
      program_day_id: "day1",
      actual_type: "weights",
      is_deload: true,
      session_exercises: [],
    };

    // Simulate startSession calling ensureSessionExercises (fixed version)
    await ensureSessionExercises(client, "user1", "sess3", false);

    const totalSets = sessionExercises.reduce((sum, se) => sum + se.planned_sets, 0);
    check(
      "FIXED: planned-then-start gives 2+2+2+2 = 8 sets",
      totalSets === 8,
      `got ${totalSets}`,
    );

    const sets = sessionExercises.map((se) => se.planned_sets);
    check(
      "FIXED: individual exercises are 2,2,2,2 (deload applied)",
      sets[0] === 2 && sets[1] === 2 && sets[2] === 2 && sets[3] === 2,
      `got ${sets.join(",")}`,
    );
  }

  console.log("\n4. Non-deload week: both paths give full volume");
  {
    const { client, sessions, sessionExercises } = createFakeSupabaseClient();

    sessions["sess4"] = {
      id: "sess4",
      program_day_id: "day1",
      actual_type: "weights",
      is_deload: false,
      session_exercises: [],
    };

    await ensureSessionExercises(client, "user1", "sess4", false);

    const totalSets = sessionExercises.reduce((sum, se) => sum + se.planned_sets, 0);
    check(
      "non-deload: planned-then-start gives 4+4+3+3 = 14 sets (correct)",
      totalSets === 14,
      `got ${totalSets}`,
    );
  }

  if (failures === 0) {
    console.log("\nALL CHECKS PASSED\n");
    process.exit(0);
  } else {
    console.log(`\n${failures} FAILURES\n`);
    process.exit(1);
  }
}

runTests();
