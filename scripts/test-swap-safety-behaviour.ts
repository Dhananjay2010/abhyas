/**
 * Behavioural swap-safety tests for PR #124 (swap-safety scope).
 *
 * Drives the REAL findAlternatives and swapExercise server actions (and through
 * them the REAL swapExerciseForUser, swapExerciseCore and buildEligibleSwapList)
 * against an in-memory PostgREST (scripts/helpers/fake-swap-db.ts). Nothing on
 * the swap path is mocked except the request-scoped auth / rate-limit /
 * revalidate edges.
 *
 * Each scenario pins the exact slugs the member is offered, and checks that the
 * server accepts exactly the offered set and refuses (without writing) the rest.
 */
import { installServerActionStubs } from "./helpers/server-action-stubs";
import { json } from "./helpers/fake-swap-db";
import {
  buildDb, exercise, activateDb, writes, SLOT_ID, byId, CATALOGUE,
  type Account, type CatalogueRow,
} from "./helpers/swap-scenario";

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passes++;
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

const healthy = (level: Account["level"], equipment: string[]): Account => ({ level, equipment, injuries: [] });
const knee = (severity: "current" | "past", level: Account["level"], equipment: string[]): Account => ({
  level, equipment, injuries: [{ body_region: "knee", severity }],
});

/**
 * A low-impact lower-body jump. Every jump in today's catalogue is also
 * high-impact, so the impact rule alone would hide a broken jump guard; this
 * row isolates the guard (name/slug keyword + lower-body primary).
 */
const LOW_IMPACT_JUMP: CatalogueRow = {
  ...exercise("bench-jump"),
  id: "00000000-0000-4000-8000-000000000001",
  slug: "low-impact-box-jump",
  name: "Low-Impact Box Jump",
  impact: "low",
  contraindicated_regions: [],
};

async function main() {
  installServerActionStubs();
  const { findAlternatives, swapExercise } = await import("../src/app/session/actions");

  const slugOf = (id: string) => (id === LOW_IMPACT_JUMP.id ? LOW_IMPACT_JUMP.slug : byId.get(id)?.slug ?? id);
  const rowOf = (slug: string) => (slug === LOW_IMPACT_JUMP.slug ? LOW_IMPACT_JUMP : exercise(slug));

  async function offered(account: Account, current: string, pool: string[], siblings: string[] = []): Promise<string[]> {
    const db = buildDb({ account, current: rowOf(current), exercises: pool.map(rowOf), siblings: siblings.map(rowOf) });
    activateDb(db);
    const res = await findAlternatives(SLOT_ID);
    if (!res.ok) throw new Error(`findAlternatives failed: ${res.error}`);
    return res.data.map((a) => slugOf(a.exerciseId));
  }

  async function trySwap(account: Account, current: string, pool: string[], target: string, opts: { siblings?: string[]; loggedSets?: number; failSiblingRead?: boolean } = {}) {
    const db = buildDb({ account, current: rowOf(current), exercises: [...pool, target].map(rowOf), siblings: (opts.siblings ?? []).map(rowOf), loggedSets: opts.loggedSets });
    if (opts.failSiblingRead) {
      db.beforeRequest = (req) =>
        req.method === "GET" && req.table === "session_exercises" && "session_id" in req.filters
          ? json(500, { code: "XX000", message: "injected sibling read failure", details: null, hint: null })
          : undefined;
    }
    activateDb(db);
    const res = await swapExercise({ sessionExerciseId: SLOT_ID, newExerciseId: rowOf(target).id });
    return { ok: res.ok, wrote: writes(db).length > 0 };
  }

  async function scenario(name: string, account: Account, current: string, pool: string[], expected: string[], siblings: string[] = []) {
    console.log(`\n${name}`);
    const got = await offered(account, current, pool, siblings);
    check(`offered = [${[...expected].sort().join(", ")}]`, sameSet(got, expected), `got [${[...got].sort().join(", ")}]`);
    for (const slug of pool) {
      const r = await trySwap(account, current, pool, slug, { siblings });
      if (expected.includes(slug)) check(`server accepts offered ${slug}`, r.ok && r.wrote, JSON.stringify(r));
      else check(`server refuses ${slug} and writes nothing`, !r.ok && !r.wrote, JSON.stringify(r));
    }
  }

  // 1. Push press: current knee vs past knee; thruster banned for any knee.
  const KB = ["kettlebell", "dumbbell"];
  const VP = ["one-arm-kettlebell-push-press", "double-kettlebell-push-press", "kettlebell-thruster", "kettlebell-seated-press", "kettlebell-arnold-press"];
  await scenario("Vertical press — healthy intermediate (control)", healthy("intermediate", KB), "alternating-kettlebell-press", VP, VP);
  await scenario("Vertical press — CURRENT knee: no KB push press, no thruster", knee("current", "intermediate", KB), "alternating-kettlebell-press", VP,
    ["kettlebell-seated-press", "kettlebell-arnold-press"]);
  await scenario("Vertical press — PAST knee: KB push press allowed, thruster banned", knee("past", "intermediate", KB), "alternating-kettlebell-press", VP,
    ["one-arm-kettlebell-push-press", "double-kettlebell-push-press", "kettlebell-seated-press", "kettlebell-arnold-press"]);

  // 2. Olympic lifts: excluded for past knee, allowed for a healthy intermediate.
  const HINGE = ["power-clean", "barbell-glute-bridge", "rack-pulls", "glute-bridge", "butt-lift-bridge"];
  await scenario("Hinge — healthy intermediate (control): power-clean offered", healthy("intermediate", ["barbell"]), "barbell-deadlift", HINGE, HINGE);
  await scenario("Hinge — PAST knee: power-clean excluded", knee("past", "intermediate", ["barbell"]), "barbell-deadlift", HINGE,
    ["barbell-glute-bridge", "rack-pulls", "glute-bridge", "butt-lift-bridge"]);

  // 3. Past-knee banned cardio (chest-push-with-run-release, jogging-treadmill).
  const CARDIO = ["chest-push-with-run-release", "air-bike", "recumbent-bike", "walking-treadmill", "jogging-treadmill"];
  const CARDIO_EQ = ["medicine_ball", "machine_generic", "treadmill"];
  await scenario("Cardio — healthy (control)", healthy("intermediate", CARDIO_EQ), "bicycling-stationary", CARDIO, CARDIO);
  await scenario("Cardio — PAST knee: chest-push-with-run-release and jogging excluded", knee("past", "intermediate", CARDIO_EQ), "bicycling-stationary", CARDIO,
    ["air-bike", "recumbent-bike", "walking-treadmill"]);

  // 4. Jump guard: lower-body jump banned for past knee; upper-body plyo kept.
  const SQUAT = ["low-impact-box-jump", "bodyweight-squat"];
  await scenario("Squat — healthy (control): low-impact box jump offered", healthy("intermediate", ["flat_bench", "dumbbell"]), "goblet-squat", SQUAT, SQUAT);
  await scenario("Squat — PAST knee: lower-body jump excluded", knee("past", "intermediate", ["flat_bench", "dumbbell"]), "goblet-squat", SQUAT,
    ["bodyweight-squat"]);
  const HP = ["plyo-push-up", "clock-push-up", "push-up-wide", "single-arm-push-up"];
  await scenario("Horizontal press (hold) — PAST knee: upper-body plyo-push-up still offered", knee("past", "intermediate", []), "isometric-wipers", HP, HP);

  // 5. The current exercise's metric drives ranking: a reps press must not be
  //    swapped to a high-impact plyo. The server must see the same metric the
  //    swap list saw.
  await scenario("Horizontal press (reps) — healthy: plyo-push-up not offered and refused", healthy("intermediate", []), "pushups-close-and-wide-hand-positions", HP,
    ["clock-push-up", "push-up-wide", "single-arm-push-up"]);

  // 6. Exercises already in the session are neither offered nor accepted.
  await scenario("Sibling exclusion — kettlebell-seated-press already in session", healthy("intermediate", KB), "alternating-kettlebell-press", VP,
    ["one-arm-kettlebell-push-press", "double-kettlebell-push-press", "kettlebell-thruster", "kettlebell-arnold-press"], ["kettlebell-seated-press"]);

  console.log("\nFail-closed and guard ordering");
  const target = "kettlebell-arnold-press";
  const base = await trySwap(healthy("intermediate", KB), "alternating-kettlebell-press", VP, target);
  check("control: valid swap is accepted and written", base.ok && base.wrote, JSON.stringify(base));
  const sib = await trySwap(healthy("intermediate", KB), "alternating-kettlebell-press", VP, target, { failSiblingRead: true });
  check("sibling read error → refused, nothing written", !sib.ok && !sib.wrote, JSON.stringify(sib));
  const logged = await trySwap(healthy("intermediate", KB), "alternating-kettlebell-press", VP, target, { loggedSets: 1 });
  check("canSwapExercise: slot with a logged set → refused, nothing written", !logged.ok && !logged.wrote, JSON.stringify(logged));
  const offPattern = await trySwap(healthy("intermediate", ["kettlebell", "dumbbell", "barbell"]), "alternating-kettlebell-press", VP, "rack-pulls");
  check("validator: target outside the swap list (rack-pulls for a press) → refused, nothing written", !offPattern.ok && !offPattern.wrote, JSON.stringify(offPattern));

  // Empty lists: two exercises that return [] for current-knee expert with full gym.
  // Intentional and approved for now; safe fallback deferred to post-deadline
  // injury-safe fallback follow-up.
  console.log("\nEmpty lists (current-knee expert, full gym)");
  const fullGym = ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "kettlebell"];
  const emptyTurkish = await offered(knee("current", "expert", fullGym), "kettlebell-turkish-get-up-lunge-style", CATALOGUE.map(e => e.slug));
  check("kettlebell-turkish-get-up-lunge-style: findAlternatives returns []", emptyTurkish.length === 0, `got ${emptyTurkish.length}`);
  const emptySwings = await offered(knee("current", "expert", fullGym), "one-arm-kettlebell-swings", CATALOGUE.map(e => e.slug));
  check("one-arm-kettlebell-swings: findAlternatives returns []", emptySwings.length === 0, `got ${emptySwings.length}`);
  
  // Server must refuse any swap attempt for these slots
  const turkishSwap = await trySwap(knee("current", "expert", fullGym), "kettlebell-turkish-get-up-lunge-style", ["bodyweight-squat"], "bodyweight-squat");
  check("kettlebell-turkish-get-up-lunge-style: server refuses swap, nothing written", !turkishSwap.ok && !turkishSwap.wrote, JSON.stringify(turkishSwap));
  const swingsSwap = await trySwap(knee("current", "expert", fullGym), "one-arm-kettlebell-swings", ["bodyweight-squat"], "bodyweight-squat");
  check("one-arm-kettlebell-swings: server refuses swap, nothing written", !swingsSwap.ok && !swingsSwap.wrote, JSON.stringify(swingsSwap));

  console.log(`\n${failures === 0 ? "✓" : "✗"} ${passes} passed, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
