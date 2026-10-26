/**
 * loadSessionSummary (the real loader getSessionSummary calls) against an
 * in-memory PostgREST, through a real supabase-js client.
 *
 * Same scenarios as scripts/test-session-summary-real-db.ts, which runs them
 * against local Supabase in the database-seed-test job.
 */
import { createEmbedFake, type Row, type Relations } from "./helpers/fake-postgrest-embed";
import { runScenarios, EXERCISE_IDS, EXERCISE_NAMES, type ScenarioSpec, type Env } from "./helpers/session-summary-scenarios";

const relations: Relations = {
  session_exercises: {
    exercises: { table: "exercises", kind: "one", local: "exercise_id", foreign: "id" },
    session_sets: { table: "session_sets", kind: "many", local: "id", foreign: "session_exercise_id" },
  },
  session_sets: {
    session_exercises: { table: "session_exercises", kind: "one", local: "session_exercise_id", foreign: "id" },
  },
};

let seq = 0;
const id = (p: string) => `${p}-${String(++seq).padStart(8, "0")}`;

const env: Env = {
  name: "in-memory PostgREST",
  seed: async (spec: ScenarioSpec) => {
    const userId = id("user");
    const otherUser = id("user");
    const tables: Record<string, Row[]> = {
      profiles: [{ id: userId, units: spec.units ?? "metric" }, { id: otherUser, units: "metric" }],
      exercises: Object.entries(EXERCISE_IDS).map(([k, v]) => ({ id: v, name: EXERCISE_NAMES[k as keyof typeof EXERCISE_IDS], mechanic: "compound", movement_pattern: "horizontal_press" })),
      session_exercises: [],
      session_sets: [],
      exercise_progress: spec.progress.map((p) => ({ user_id: userId, exercise_id: EXERCISE_IDS[p.ex], ...p })),
    };
    const addSession = (s: ScenarioSpec["current"], uid: string): string => {
      const sessionId = id("session");
      s.exercises.forEach((e, i) => {
        const seId = id("se");
        tables.session_exercises.push({
          id: seId, session_id: sessionId, user_id: uid, exercise_id: EXERCISE_IDS[e.ex], order_index: i,
          planned_sets: e.sets.length, planned_reps_min: 8, planned_reps_max: e.planned_reps_max ?? 12,
          metric: "reps", feel: "right", status: e.status,
        });
        e.sets.forEach((st, j) => tables.session_sets.push({
          id: st.last ? "zzzz-last" : id("set"), session_exercise_id: seId, user_id: uid, set_number: j + 1,
          reps: st.reps, weight_kg: st.w, duration_seconds: null, is_warmup_set: !!st.warm,
        }));
      });
      return sessionId;
    };
    for (const h of spec.history) addSession(h, userId);
    // Another user's heavier lift must never count.
    addSession({ exercises: [{ ex: "bench", status: "completed", sets: [{ reps: 10, w: 300 }] }] }, otherUser);
    const sessionId = addSession(spec.current, userId);
    return { client: createEmbedFake(tables, relations).client, userId, sessionId };
  },
};

runScenarios(env).then((failures) => {
  if (failures > 0) {
    console.log(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All loadSessionSummary scenarios passed");
}).catch((e) => {
  console.error("✗ ERROR", e);
  process.exit(1);
});
