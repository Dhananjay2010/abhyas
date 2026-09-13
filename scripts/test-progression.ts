/**
 * Checks the double-progression engine against concrete scenarios.
 *
 *   npx tsx scripts/test-progression.ts
 */
import {
  describePersonalBest,
  evaluateProgression,
  incrementFor,
  suggestedWeight,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";
import { prescribe } from "../src/lib/program/prescription";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};
const SQUAT: ExerciseMeta = { ...BENCH, movementPattern: "squat" };
const CURL: ExerciseMeta = { ...BENCH, mechanic: "isolation", movementPattern: "biceps" };
const PUSHUP: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
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

console.log("\n12. A weight logged on a bodyweight exercise must count");
{
  // Regression: weighted sit-ups took the rep path because the exercise needs
  // no equipment, so the load was thrown away and never progressed.
  const weighted = run({
    meta: PUSHUP,
    sets: sets(4, 12, 25),
    feel: "right",
    state: fresh({ currentWorkingWeightKg: 25, currentTargetReps: 12 }),
  });
  check("load progresses when a weight was used", weighted.nextWorkingWeightKg === 27.5,
    `${weighted.nextWorkingWeightKg}`);
  check("outcome is progressed", weighted.outcome === "progressed", weighted.outcome);

  // With no weight it must still take the rep/variation path.
  const unweighted = run({
    meta: PUSHUP,
    sets: sets(4, 12, null),
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 12 }),
  });
  check("no weight still progresses reps", unweighted.nextTargetReps === 14,
    `${unweighted.nextTargetReps}`);
  check("and invents no weight", unweighted.nextWorkingWeightKg === null);

  // An equipment-based exercise logged with no weight must not claim a variation.
  const noLoad = run({
    meta: BENCH,
    sets: sets(4, 12, null),
    state: fresh({ currentWorkingWeightKg: null }),
  });
  check("equipment exercise with no weight does not ask for a variation",
    !noLoad.wantsHarderVariation, `${noLoad.outcome}`);
}

// ---------------------------------------------------------------------------
// Timed exercises. A hold is measured in seconds, and those seconds travel in
// `durationSeconds`; `reps` stays null. The target range is in the exercise's
// own metric, so repsMin/repsMax here are seconds. See SPEC.md section 7.
// ---------------------------------------------------------------------------
{
  console.log("\nTimed exercises (metric: seconds)");

  const PLANK: ExerciseMeta = {
    mechanic: "isolation",
    metric: "seconds",
    movementPattern: "core",
    isBodyweight: true,
    progressionChain: null,
    progressionRank: null,
  };
  const PLANK_CHAINED: ExerciseMeta = { ...PLANK, progressionChain: "plank" };

  const holds = (n: number, seconds: number, w: number | null = null) =>
    Array.from({ length: n }, () => ({ reps: null, weightKg: w, durationSeconds: seconds }));

  const hold = (over: Partial<Parameters<typeof evaluateProgression>[0]> = {}) =>
    evaluateProgression({
      sets: holds(2, 45),
      plannedSets: 2,
      repsMin: 20,
      repsMax: 45,
      feel: "right",
      meta: PLANK,
      state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 45 }),
      isDeload: false,
      ...over,
    });

  const up = hold();
  check("every set held to the top adds five seconds", up.nextTargetReps === 50,
    `${up.nextTargetReps}`);
  check("and says so in seconds", up.message.includes("50s"), up.message);
  check("and invents no weight", up.nextWorkingWeightKg === null);

  const short = hold({ sets: holds(2, 30) });
  check("short of the top holds the length", short.outcome === "hold", short.outcome);
  check("and does not talk about weight",
    !short.message.toLowerCase().includes("weight"), short.message);

  // Reps are not what a hold is measured in: a set carrying only `reps` is not
  // a hold at all, and must not be read as one.
  const repsOnly = hold({ sets: [{ reps: 45, weightKg: null }, { reps: 45, weightKg: null }] });
  check("reps on a timed exercise count for nothing", repsOnly.outcome === "no_data",
    repsOnly.outcome);

  // The ceiling: past two minutes, more time stops being the answer.
  const atCeiling = hold({
    sets: holds(2, 120),
    repsMax: 120,
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 120 }),
  });
  check("an unchained hold stops at the ceiling", atCeiling.nextTargetReps === 120,
    `${atCeiling.nextTargetReps}`);
  check("and suggests loading it instead",
    atCeiling.message.includes("add weight"), atCeiling.message);

  const chainedAtCeiling = hold({
    meta: PLANK_CHAINED,
    sets: holds(2, 120),
    repsMax: 120,
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 120 }),
  });
  check("a chained hold moves to a harder variation instead",
    chainedAtCeiling.wantsHarderVariation && chainedAtCeiling.outcome === "variation_up",
    chainedAtCeiling.outcome);

  // Epley over seconds would be nonsense, so a weighted hold records no e1RM.
  const weighted = hold({
    sets: holds(2, 45, 20),
    state: fresh({ currentWorkingWeightKg: 20, currentTargetReps: 45, bestE1rm: null }),
  });
  check("a weighted hold records no estimated one-rep max", weighted.bestE1rm === null,
    `${weighted.bestE1rm}`);
  check("but does record the longest hold", weighted.bestReps === 45, `${weighted.bestReps}`);
}

{
  console.log("\nPrescribing a hold");
  const plank = prescribe("muscle_gain", "intermediate", true, "seconds");
  check("a hold is prescribed in seconds, not 8-12 reps",
    plank.repsMin === 20 && plank.repsMax === 40, `${plank.repsMin}-${plank.repsMax}`);
  check("and never gets a heavy-single rest",
    prescribe("strength", "intermediate", false, "seconds").restSeconds <= 75,
    `${prescribe("strength", "intermediate", false, "seconds").restSeconds}s`);
  check("strength holds are shorter than fat-loss holds",
    prescribe("strength", "intermediate", true, "seconds").repsMax <
      prescribe("fat_loss", "intermediate", true, "seconds").repsMax);
  check("a rep exercise is untouched by the new argument",
    prescribe("muscle_gain", "intermediate", false).repsMax === 12);
}

{
  console.log("\nPersonal bests (SPEC section 7: a best BEATEN, not a best set)");

  const PLANK: ExerciseMeta = {
    mechanic: "isolation",
    metric: "seconds",
    movementPattern: "core",
    isBodyweight: true,
    progressionChain: null,
    progressionRank: null,
  };
  const PUSHUP_BW: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "horizontal_press",
    isBodyweight: true,
    progressionChain: null,
    progressionRank: null,
  };

  const heavier = run({ sets: sets(4, 12, 65) });
  check("a heavier set is a personal best", heavier.personalBest?.kind === "weight",
    `${heavier.personalBest?.kind}`);
  check("and reads as one",
    heavier.personalBest !== null &&
      describePersonalBest(heavier.personalBest) === "Heaviest set yet — 65 kg",
    heavier.personalBest ? describePersonalBest(heavier.personalBest) : "none");

  const same = run({ sets: sets(4, 12, 60) });
  check("repeating your best is not a best", same.personalBest === null,
    `${same.personalBest?.kind}`);

  const first = run({
    sets: sets(4, 12, 60),
    state: fresh({ bestWeightKg: null, bestReps: null, bestE1rm: null }),
  });
  check("a first session sets a baseline and claims no record", first.personalBest === null,
    `${first.personalBest?.kind}`);
  check("but does record the bests themselves",
    first.bestWeightKg === 60 && first.bestReps === 12, `${first.bestWeightKg}/${first.bestReps}`);

  // The case a weight comparison alone misses: same load, more reps.
  const moreReps = run({ sets: sets(4, 14, 60) });
  check("more reps at a weight already lifted is an estimated-1RM best",
    moreReps.personalBest?.kind === "e1rm", `${moreReps.personalBest?.kind}`);

  const bodyweight = run({
    meta: PUSHUP_BW,
    sets: sets(4, 15, 0),
    state: fresh({ currentWorkingWeightKg: null }),
  });
  check("unloaded work reports reps, not a weight of zero",
    bodyweight.personalBest?.kind === "reps", `${bodyweight.personalBest?.kind}`);

  const longer = evaluateProgression({
    sets: Array.from({ length: 2 }, () => ({ reps: null, weightKg: null, durationSeconds: 50 })),
    plannedSets: 2,
    repsMin: 20,
    repsMax: 45,
    feel: "right",
    meta: PLANK,
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 45, bestReps: 45 }),
    isDeload: false,
  });
  check("a longer hold is a hold best, not a rep count",
    longer.personalBest?.kind === "hold", `${longer.personalBest?.kind}`);
  check("and reads in seconds",
    longer.personalBest !== null &&
      describePersonalBest(longer.personalBest) === "Longest hold yet — 50s",
    longer.personalBest ? describePersonalBest(longer.personalBest) : "none");

  const deload = run({ sets: sets(4, 12, 65), isDeload: true });
  check("a deload week claims nothing, however it went", deload.personalBest === null,
    `${deload.personalBest?.kind}`);
  check("and tells a lifter their weights are held",
    deload.message.includes("weights held"), deload.message);
  const deloadBw = run({
    meta: PUSHUP_BW,
    sets: sets(4, 12, 0),
    state: fresh({ currentWorkingWeightKg: null }),
    isDeload: true,
  });
  check("while someone with no weight is not told about weights",
    !deloadBw.message.includes("weight"), deloadBw.message);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
