/**
 * Checks the double-progression engine against concrete scenarios.
 *
 *   npx tsx scripts/test-progression.ts
 */
import {
  evaluateProgression,
  incrementFor,
  suggestedWeight,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};
const SQUAT: ExerciseMeta = { ...BENCH, movementPattern: "squat" };
const CURL: ExerciseMeta = { ...BENCH, mechanic: "isolation", movementPattern: "biceps" };
const PUSHUP: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  isBodyweight: true,
  progressionChain: "push",
  progressionRank: 1,
};

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 60,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 60,
  bestReps: 12,
  bestE1rm: 84,
  totalSessions: 3,
  ...over,
});

const sets = (n: number, reps: number, w: number | null = 60) =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

const run = (over: Partial<Parameters<typeof evaluateProgression>[0]> = {}) =>
  evaluateProgression({
    sets: sets(4, 12),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh(),
    isDeload: false,
    ...over,
  });

console.log("\n1. Increment sizes (SPEC section 6)");
check("isolation is 1.25 kg", incrementFor(CURL) === 1.25, `${incrementFor(CURL)}`);
check("upper compound is 2.5 kg", incrementFor(BENCH) === 2.5, `${incrementFor(BENCH)}`);
check("lower compound is 5 kg", incrementFor(SQUAT) === 5, `${incrementFor(SQUAT)}`);

console.log("\n2. Every set at the top of the range progresses the weight");
{
  const d = run();
  check("outcome progressed", d.outcome === "progressed", d.outcome);
  check("60 -> 62.5 kg", d.nextWorkingWeightKg === 62.5, `${d.nextWorkingWeightKg}`);
  check("failures reset", d.consecutiveFailures === 0);
}
{
  const d = run({ meta: SQUAT, state: fresh({ currentWorkingWeightKg: 100 }), sets: sets(4, 12, 100) });
  check("squat 100 -> 105 kg", d.nextWorkingWeightKg === 105, `${d.nextWorkingWeightKg}`);
}
{
  const d = run({ meta: CURL, state: fresh({ currentWorkingWeightKg: 15 }), sets: sets(4, 12, 15) });
  check("curl 15 -> 16.25 kg", d.nextWorkingWeightKg === 16.25, `${d.nextWorkingWeightKg}`);
}

console.log("\n3. 'Easy' earns a double jump");
{
  const d = run({ feel: "easy" });
  check("60 -> 65 kg on easy", d.nextWorkingWeightKg === 65, `${d.nextWorkingWeightKg}`);
  const hard = run({ feel: "hard" });
  check("'hard' still takes the normal jump when all sets hit", hard.nextWorkingWeightKg === 62.5);
}

console.log("\n4. Falling short holds the weight");
{
  const d = run({ sets: sets(4, 10) });
  check("outcome hold", d.outcome === "hold", d.outcome);
  check("weight unchanged", d.nextWorkingWeightKg === 60, `${d.nextWorkingWeightKg}`);
  check("failure counted", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
}
{
  const d = run({ sets: sets(3, 12) });
  check("missing a set is not success", d.outcome === "hold", d.outcome);
}
{
  const d = run({ sets: [{ reps: 12, weightKg: 60 }, { reps: 12, weightKg: 60 }, { reps: 12, weightKg: 60 }, { reps: 9, weightKg: 60 }] });
  check("one short set is not success", d.outcome === "hold", d.outcome);
}

console.log("\n5. Two misses in a row backs the weight off ~10%");
{
  const d = run({ sets: sets(4, 10), state: fresh({ consecutiveFailures: 1 }) });
  check("outcome backed_off", d.outcome === "backed_off", d.outcome);
  check("60 -> 55 kg", d.nextWorkingWeightKg === 55, `${d.nextWorkingWeightKg}`);
  check("failures reset after backing off", d.consecutiveFailures === 0);
}

console.log("\n6. Deload weeks do not judge progress");
{
  const d = run({ isDeload: true, sets: sets(4, 8) });
  check("outcome deload_week", d.outcome === "deload_week", d.outcome);
  check("weight untouched", d.nextWorkingWeightKg === 60);
  check("no failure recorded", d.consecutiveFailures === 0);
}

console.log("\n7. Missing rep data changes nothing");
{
  const d = run({ sets: [{ reps: null, weightKg: null }] });
  check("outcome no_data", d.outcome === "no_data", d.outcome);
  check("weight untouched", d.nextWorkingWeightKg === 60);
}

console.log("\n8. Bodyweight progresses by reps, then by variation");
{
  const d = run({
    meta: PUSHUP,
    sets: sets(4, 12, null),
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 12 }),
  });
  check("reps target rises to 14", d.outcome === "progressed" && d.nextTargetReps === 14,
    `${d.outcome} ${d.nextTargetReps}`);
  check("no weight invented", d.nextWorkingWeightKg === null);
}
{
  const d = run({
    meta: PUSHUP,
    sets: sets(4, 18, null),
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 16 }),
  });
  check("asks for a harder variation", d.outcome === "variation_up" && d.wantsHarderVariation,
    d.outcome);
  check("rep target resets for the new variation", d.nextTargetReps === 12, `${d.nextTargetReps}`);
}

console.log("\n9. First time on an exercise");
{
  const d = run({
    state: fresh({ currentWorkingWeightKg: null, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0 }),
    sets: sets(4, 12, 40),
  });
  check("uses the weight actually lifted as the base", d.nextWorkingWeightKg === 42.5,
    `${d.nextWorkingWeightKg}`);
  check("records a best", d.bestWeightKg === 40 && d.bestReps === 12);
}

console.log("\n10. Personal bests track even on a failed session");
{
  const d = run({ sets: [{ reps: 6, weightKg: 90 }, { reps: 5, weightKg: 90 }], state: fresh() });
  check("best weight updated", d.bestWeightKg === 90, `${d.bestWeightKg}`);
  check("best e1RM updated", (d.bestE1rm ?? 0) > 100, `${d.bestE1rm?.toFixed(1)}`);
  check("but it is still a miss", d.outcome === "hold", d.outcome);
}

console.log("\n11. Deload suggests roughly 70% of working weight");
{
  const normal = suggestedWeight({ currentWorkingWeightKg: 100 }, false, SQUAT);
  const deload = suggestedWeight({ currentWorkingWeightKg: 100 }, true, SQUAT);
  check("normal week suggests the working weight", normal === 100, `${normal}`);
  check("deload suggests 70 kg", deload === 70, `${deload}`);
  check("no suggestion without a working weight",
    suggestedWeight({ currentWorkingWeightKg: null }, false, SQUAT) === null);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
