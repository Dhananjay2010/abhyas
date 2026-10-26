/**
 * Shared scenarios for loadSessionSummary, run twice:
 *   - scripts/test-session-summary-from-db.ts against an in-memory PostgREST
 *     stand-in (every CI shard), and
 *   - scripts/test-session-summary-real-db.ts against local Supabase
 *     (database-seed-test job, REAL_DB=1).
 *
 * Every scenario seeds rows in the state they are in AFTER finishExercise has
 * run applyProgression, i.e. exercise_progress already holds this session's
 * result, which is the trap an earlier version fell into.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { loadSessionSummary, HISTORY_PAGE_SIZE, type SummaryNote } from "../../src/lib/session/load-session-summary";

export type ExKey = "bench" | "db";
export const EXERCISE_IDS: Record<ExKey, string> = {
  bench: "barbell-bench-press-medium-grip",
  db: "dumbbell-bench-press",
};
export const EXERCISE_NAMES: Record<ExKey, string> = {
  bench: "Barbell Bench Press - Medium Grip",
  db: "Dumbbell Bench Press",
};

export type SetSpec = { reps: number; w: number; warm?: boolean; last?: boolean };
export type ExSpec = { ex: ExKey; status: "completed" | "skipped"; planned_reps_max?: number; sets: SetSpec[] };
export type SessionSpec = { exercises: ExSpec[] };
export type ScenarioSpec = {
  units?: "metric" | "imperial";
  history: SessionSpec[];
  current: SessionSpec;
  progress: Array<{ ex: ExKey; current_working_weight_kg: number; current_target_reps: number; best_weight_kg: number; best_e1rm: number }>;
};

export type Seeded = { client: SupabaseClient<Database>; userId: string; sessionId: string; cleanup?: () => Promise<void> };
export type Env = { name: string; seed: (spec: ScenarioSpec) => Promise<Seeded> };

const sets = (n: number, reps: number, w: number, extra: Partial<SetSpec> = {}): SetSpec[] =>
  Array.from({ length: n }, () => ({ reps, w, ...extra }));

const progressAfter = (ex: ExKey, w: number, next: number) => ({
  ex,
  current_working_weight_kg: next,
  current_target_reps: 12,
  // Already overwritten with THIS session's bests by applyProgression.
  best_weight_kg: Math.max(w, 200),
  best_e1rm: 999,
});

export async function runScenarios(env: Env): Promise<number> {
  let failures = 0;
  const check = (label: string, pass: boolean, detail?: string) => {
    console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
    if (!pass) failures++;
  };
  const run = async (spec: ScenarioSpec): Promise<SummaryNote[]> => {
    const s = await env.seed(spec);
    try {
      return await loadSessionSummary(s.client, s.sessionId, s.userId);
    } finally {
      await s.cleanup?.();
    }
  };
  const find = (notes: SummaryNote[], ex: ExKey) => notes.find((n) => n.name === EXERCISE_NAMES[ex]);

  console.log(`loadSessionSummary scenarios (${env.name})\n`);

  console.log("1. Heavier than any earlier session: PB, even though exercise_progress already holds it");
  {
    const notes = await run({
      history: [{ exercises: [{ ex: "bench", status: "completed", sets: sets(3, 10, 80) }] }],
      current: { exercises: [{ ex: "bench", status: "completed", planned_reps_max: 12, sets: sets(3, 12, 85) }] },
      progress: [progressAfter("bench", 85, 87.5)],
    });
    const n = find(notes, "bench");
    check("bench note present", !!n, JSON.stringify(notes));
    check("note says weight up", n?.message === "Weight up next time", n?.message);
    check("PB is the heaviest set, 85 kg", n?.personalBest === "Heaviest set yet — 85 kg", String(n?.personalBest));
  }

  console.log("\n2. An earlier session was heavier: no PB");
  {
    const notes = await run({
      history: [{ exercises: [{ ex: "bench", status: "completed", sets: sets(3, 10, 100) }] }],
      current: { exercises: [{ ex: "bench", status: "completed", sets: sets(3, 10, 85) }] },
      progress: [progressAfter("bench", 85, 85)],
    });
    check("no PB", find(notes, "bench")?.personalBest === null, String(find(notes, "bench")?.personalBest));
  }

  console.log("\n3. More reps at the same weight: e1RM PB");
  {
    const notes = await run({
      history: [{ exercises: [{ ex: "bench", status: "completed", sets: sets(3, 8, 85) }] }],
      current: { exercises: [{ ex: "bench", status: "completed", sets: sets(3, 10, 85) }] },
      progress: [progressAfter("bench", 85, 85)],
    });
    const pb = find(notes, "bench")?.personalBest ?? "";
    check("e1RM PB", pb.startsWith("Best estimated one-rep max yet — "), pb);
  }

  console.log("\n4. Heavier warm-ups (this session and earlier) are ignored");
  {
    const notes = await run({
      history: [{ exercises: [{ ex: "bench", status: "completed", sets: [{ reps: 1, w: 150, warm: true }, ...sets(3, 10, 80)] }] }],
      current: { exercises: [{ ex: "bench", status: "completed", sets: [{ reps: 1, w: 120, warm: true }, ...sets(3, 10, 85)] }] },
      progress: [progressAfter("bench", 85, 87.5)],
    });
    check("PB is 85 kg, not the 120 kg warm-up, and not blocked by the 150 kg one",
      find(notes, "bench")?.personalBest === "Heaviest set yet — 85 kg", String(find(notes, "bench")?.personalBest));
  }

  console.log("\n5. Skipped exercises are ignored, here and in history");
  {
    const notes = await run({
      history: [
        { exercises: [{ ex: "bench", status: "skipped", sets: sets(2, 5, 200) }] },
        { exercises: [{ ex: "bench", status: "completed", sets: sets(3, 10, 80) }] },
      ],
      current: {
        exercises: [
          { ex: "bench", status: "completed", sets: sets(3, 10, 85) },
          { ex: "db", status: "skipped", sets: sets(1, 10, 30) },
        ],
      },
      progress: [progressAfter("bench", 85, 87.5), progressAfter("db", 30, 30)],
    });
    check("PB not blocked by the skipped 200 kg sets", find(notes, "bench")?.personalBest === "Heaviest set yet — 85 kg", String(find(notes, "bench")?.personalBest));
    check("skipped exercise has no note", !find(notes, "db"), JSON.stringify(notes.map((n) => n.name)));
  }

  console.log("\n6. First session ever: nothing to beat, no PB");
  {
    const notes = await run({
      history: [],
      current: { exercises: [{ ex: "bench", status: "completed", sets: sets(3, 10, 85) }] },
      progress: [progressAfter("bench", 85, 85)],
    });
    check("note present, no PB", !!find(notes, "bench") && find(notes, "bench")?.personalBest === null, JSON.stringify(notes));
  }

  console.log("\n7. Imperial user: PB in lb");
  {
    const notes = await run({
      units: "imperial",
      history: [{ exercises: [{ ex: "bench", status: "completed", sets: sets(3, 10, 80) }] }],
      current: { exercises: [{ ex: "bench", status: "completed", sets: sets(3, 10, 85) }] },
      progress: [progressAfter("bench", 85, 87.5)],
    });
    const pb = find(notes, "bench")?.personalBest ?? "";
    check("PB in lb", pb.startsWith("Heaviest set yet — ") && pb.endsWith(" lb"), pb);
  }

  console.log(`\n8. History longer than one page (${HISTORY_PAGE_SIZE} rows): the heaviest set is on page 2`);
  {
    const perSession = 100;
    const n = Math.ceil((HISTORY_PAGE_SIZE + 50) / perSession);
    const history: SessionSpec[] = Array.from({ length: n }, () => ({
      exercises: [{ ex: "bench" as const, status: "completed" as const, sets: sets(perSession, 10, 50) }],
    }));
    history.push({ exercises: [{ ex: "bench", status: "completed", sets: [{ reps: 10, w: 100, last: true }] }] });
    const notes = await run({
      history,
      current: { exercises: [{ ex: "bench", status: "completed", sets: sets(3, 10, 85) }] },
      progress: [progressAfter("bench", 85, 85)],
    });
    check("no false PB from a truncated history", find(notes, "bench")?.personalBest === null, String(find(notes, "bench")?.personalBest));
  }

  return failures;
}
