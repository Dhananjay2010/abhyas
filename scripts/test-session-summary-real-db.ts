/**
 * loadSessionSummary against local Supabase (real PostgREST, real RLS).
 *
 * Same scenarios as scripts/test-session-summary-from-db.ts. Each scenario
 * gets a fresh user, seeded with the service-role client, then the loader runs
 * as that user. Scenario 8 seeds more than one page of history (PostgREST
 * max_rows = 1000) with the heaviest set sorting last by id.
 *
 * Run: supabase start && REAL_DB=1 npm run test:session-summary-real-db
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "crypto";
import type { Database } from "../src/lib/database.types";
import { runScenarios, EXERCISE_IDS, EXERCISE_NAMES, type ScenarioSpec, type Env, type SessionSpec } from "./helpers/session-summary-scenarios";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function main() {
  if (process.env.REAL_DB !== "1") {
    console.log("⏭️  Skipping real DB tests (REAL_DB=1 not set)");
    return;
  }
  const admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const must = <T>(label: string, r: { error: { message: string } | null; data?: T }) => {
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
    return r.data as T;
  };

  // Real exercise ids are uuids: look them up by name from the seeded catalogue.
  const { data: exRows } = await admin.from("exercises").select("id, name").in("name", Object.values(EXERCISE_NAMES));
  for (const key of Object.keys(EXERCISE_NAMES) as Array<keyof typeof EXERCISE_NAMES>) {
    const row = (exRows ?? []).find((r) => r.name === EXERCISE_NAMES[key]);
    if (!row) throw new Error(`exercise not seeded: ${EXERCISE_NAMES[key]}`);
    EXERCISE_IDS[key] = row.id;
  }

  let day = 0;
  const env: Env = {
    name: "local Supabase",
    seed: async (spec: ScenarioSpec) => {
      const email = `summary-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
      const password = "test-password-123";
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
      const userId = created.data.user.id;
      must("profile units", await admin.from("profiles").update({ units: spec.units ?? "metric" }).eq("id", userId));

      const addSession = async (s: SessionSpec, status: "completed" | "in_progress"): Promise<string> => {
        const sessionId = randomUUID();
        day++;
        const localDate = new Date(Date.UTC(2026, 0, 1) + day * 86400000).toISOString().slice(0, 10);
        must("session", await admin.from("sessions").insert({
          id: sessionId, user_id: userId, local_date: localDate, status, actual_type: "weights", planned_type: "weights",
        }));
        for (const [i, e] of s.exercises.entries()) {
          const seId = randomUUID();
          must("session_exercise", await admin.from("session_exercises").insert({
            id: seId, session_id: sessionId, user_id: userId, exercise_id: EXERCISE_IDS[e.ex], order_index: i,
            planned_sets: e.sets.length, planned_reps_min: 8, planned_reps_max: e.planned_reps_max ?? 12,
            status: e.status, metric: "reps",
          }));
          const rows = e.sets.map((st, j) => ({
            ...(st.last ? { id: `ffffffff-ffff-4fff-bfff-${randomBytes(6).toString("hex")}` } : {}),
            session_exercise_id: seId, user_id: userId, set_number: j + 1, reps: st.reps, weight_kg: st.w, is_warmup_set: !!st.warm,
          }));
          for (let k = 0; k < rows.length; k += 500) {
            must("session_sets", await admin.from("session_sets").insert(rows.slice(k, k + 500)));
          }
        }
        return sessionId;
      };

      for (const h of spec.history) await addSession(h, "completed");
      const sessionId = await addSession(spec.current, "in_progress");
      for (const p of spec.progress) {
        must("exercise_progress", await admin.from("exercise_progress").upsert({
          user_id: userId, exercise_id: EXERCISE_IDS[p.ex],
          current_working_weight_kg: p.current_working_weight_kg, current_target_reps: p.current_target_reps,
          best_weight_kg: p.best_weight_kg, best_e1rm: p.best_e1rm,
        }));
      }

      const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const signIn = await client.auth.signInWithPassword({ email, password });
      if (signIn.error) throw new Error(`signIn: ${signIn.error.message}`);
      return {
        client,
        userId,
        sessionId,
        cleanup: async () => {
          await admin.auth.admin.deleteUser(userId);
        },
      };
    },
  };

  const failures = await runScenarios(env);
  if (failures > 0) {
    console.log(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All loadSessionSummary real-DB scenarios passed");
}

main().catch((e) => {
  console.error("✗ ERROR", e);
  process.exit(1);
});
