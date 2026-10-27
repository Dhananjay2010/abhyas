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
  weightAtFailureStartKg: null,
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
  const d = run({ meta: CURL, state: fresh({ currentWorkingWeightKg: 15 }), sets: sets(4, 12, 15), equipmentIds: ["dumbbell"], unit: "kg" });
  check("curl 15 -> 17.5 kg (isolation 1.25 + grid round up)", d.nextWorkingWeightKg === 17.5, `${d.nextWorkingWeightKg}`);
}

console.log("\n3. 'Easy' earns a double jump; Hard holds weight (U1 fix)");
{
  const d = run({ feel: "easy", equipmentIds: ["barbell"], unit: "kg" });
  check("60 -> 65 kg on easy", d.nextWorkingWeightKg === 65, `${d.nextWorkingWeightKg}`);
  const hard = run({ feel: "hard", equipmentIds: ["barbell"], unit: "kg" });
  // U1 fix: Hard feel must NOT raise the weight - it holds at current weight
  check("'hard' holds the weight when all sets hit (U1 fix)", hard.nextWorkingWeightKg === 60, `${hard.nextWorkingWeightKg}`);
  check("'hard' outcome is hold", hard.outcome === "hold", hard.outcome);
}

console.log("\n4. Falling short of the top is in-range: hold and reset failures");
{
  const d = run({ sets: sets(4, 10), equipmentIds: ["barbell"], unit: "kg" });
  check("4×10 in 8-12: outcome hold", d.outcome === "hold", d.outcome);
  check("4×10 in-range: weight held at 60", d.nextWorkingWeightKg === 60, `${d.nextWorkingWeightKg}`);
  check("4×10 in-range: failures reset to 0", d.consecutiveFailures === 0, `${d.consecutiveFailures}`);
}
{
  // Real miss: below repsMin
  const d = run({ sets: sets(4, 7), equipmentIds: ["barbell"], unit: "kg" });
  check("4×7 below min: outcome hold", d.outcome === "hold", d.outcome);
  check("4×7 real miss: weight drops one grid step (60 -> 57.5)", d.nextWorkingWeightKg === 57.5, `${d.nextWorkingWeightKg}`);
  check("4×7 real miss: failure counted", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
}
{
  const d = run({ sets: sets(3, 12) });
  check("missing a set is not success", d.outcome === "hold", d.outcome);
}
{
  const d = run({ sets: [{ reps: 12, weightKg: 60 }, { reps: 12, weightKg: 60 }, { reps: 12, weightKg: 60 }, { reps: 9, weightKg: 60 }] });
  check("one short set is not success", d.outcome === "hold", d.outcome);
}

console.log("\n5. Two consecutive real misses backs the weight off ~10%");
{
  const d = run({ sets: sets(4, 7), state: fresh({ consecutiveFailures: 1 }), equipmentIds: ["barbell"], unit: "kg" });
  check("outcome backed_off", d.outcome === "backed_off", d.outcome);
  check("60 -> 52.5 kg", d.nextWorkingWeightKg === 52.5, `${d.nextWorkingWeightKg}`);
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
  const normal = suggestedWeight({ currentWorkingWeightKg: 100 }, false, SQUAT, ["barbell"]);
  const deload = suggestedWeight({ currentWorkingWeightKg: 100 }, true, SQUAT, ["barbell"]);
  check("normal week suggests the working weight", normal === 100, `${normal}`);
  check("deload suggests 70 kg", deload === 70, `${deload}`);
  check("no suggestion without a working weight",
    suggestedWeight({ currentWorkingWeightKg: null }, false, SQUAT, ["barbell"]) === null);
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
    equipmentIds: ["dip_bars"],
    unit: "kg",
  });
  check("load progresses when a weight was used (1.25 kg step, no dip_belt mapping)", weighted.nextWorkingWeightKg === 26.25,
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
      equipmentIds: [],
      unit: "kg",
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
  console.log("\nPer-set logging off: a set with no numbers in it");
  // The mode records that a set happened and nothing else, so every field is
  // null. Progression must treat that as "no data", not as a failed session --
  // two failed sessions in a row drop the working weight ten percent.
  const ticked = run({
    sets: Array.from({ length: 4 }, () => ({ reps: null, weightKg: null })),
  });
  check("ticking sets off is not a missed session", ticked.outcome === "no_data",
    ticked.outcome);
  check("the working weight is untouched", ticked.nextWorkingWeightKg === 60,
    `${ticked.nextWorkingWeightKg}`);
  check("and the failure count does not climb", ticked.consecutiveFailures === 0,
    `${ticked.consecutiveFailures}`);
  check("no best is claimed from nothing", ticked.personalBest === null);
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
    sets: sets(4, 10, 60),
    state: fresh({ bestWeightKg: null, bestReps: null, bestE1rm: null }),
  });
  check("a first session sets a baseline and claims no record", first.personalBest === null,
    `${first.personalBest?.kind}`);
  check("but does record the bests themselves",
    first.bestWeightKg === 60 && first.bestReps === 10, `${first.bestWeightKg}/${first.bestReps}`);

  // The case a weight comparison alone misses: same load, more reps.
  // Prior: 60×10 = 80.00, New: 60×12 = 84.00 (with 12-rep cap)
  const moreReps = run({ 
    sets: sets(4, 12, 60),
    state: fresh({ 
      bestWeightKg: first.bestWeightKg, 
      bestReps: first.bestReps, 
      bestE1rm: first.bestE1rm 
    })
  });
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
    equipmentIds: [],
    unit: "kg",
  });
  check("a longer hold is a hold best, not a rep count",
    longer.personalBest?.kind === "hold", `${longer.personalBest?.kind}`);
  check("and reads in seconds",
    longer.personalBest !== null &&
      describePersonalBest(longer.personalBest) === "Longest hold yet — 50s",
    longer.personalBest ? describePersonalBest(longer.personalBest) : "none");

  const deload = run({ sets: sets(4, 12, 65), isDeload: true });
  check("deload week tracks bests", deload.personalBest?.kind === "weight",
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

console.log("\nBodyweight exercises with added weight");
{
  // Lower-body bodyweight with added weight: 2.5 kg step, never doubled.
  const SQUAT_BW: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "squat",
    isBodyweight: true,
    progressionChain: null,
    progressionRank: null,
  };
  const lower = run({
    meta: SQUAT_BW,
    sets: sets(4, 12, 10),
    state: fresh({ currentWorkingWeightKg: 10, currentTargetReps: 12 }),
    feel: "right",
  });
  check("lower-body bodyweight with 10 kg added goes to 12.5 kg",
    lower.nextWorkingWeightKg === 12.5, `${lower.nextWorkingWeightKg}`);

  // Guard: would be 15 kg with the old code (10 + 5).
  check("NOT 15 kg with old incrementFor", lower.nextWorkingWeightKg !== 15,
    `got ${lower.nextWorkingWeightKg}, old would give 15`);

  // Easy does NOT double for bodyweight with added weight.
  const lowerEasy = run({
    meta: SQUAT_BW,
    sets: sets(4, 12, 10),
    state: fresh({ currentWorkingWeightKg: 10, currentTargetReps: 12 }),
    feel: "easy",
  });
  check("easy still gives 12.5 kg, NOT doubled",
    lowerEasy.nextWorkingWeightKg === 12.5, `${lowerEasy.nextWorkingWeightKg}`);
  check("NOT 15 kg when easy", lowerEasy.nextWorkingWeightKg !== 15);

  // Upper-body bodyweight with added weight: 1.25 kg step.
  const PUSHUP_LOADED: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "horizontal_press",
    isBodyweight: true,
    progressionChain: null,
    progressionRank: null,
  };
  const upper = run({
    meta: PUSHUP_LOADED,
    sets: sets(4, 12, 5),
    state: fresh({ currentWorkingWeightKg: 5, currentTargetReps: 12 }),
    equipmentIds: ["dip_belt"],
    unit: "kg",
  });
  check("upper-body bodyweight with 5 kg added goes to 7.5 kg (grid round up)",
    upper.nextWorkingWeightKg === 7.5, `${upper.nextWorkingWeightKg}`);

  // Back-off: two consecutive real misses drop added weight to 0.
  const backoff = run({
    meta: SQUAT_BW,
    sets: sets(4, 7, 10), // Below min (8-12 range)
    state: fresh({ currentWorkingWeightKg: 10, consecutiveFailures: 1 }),
  });
  check("two real misses with added weight drop to 0",
    backoff.nextWorkingWeightKg === 0, `${backoff.nextWorkingWeightKg}`);
  check("message says back to bodyweight",
    backoff.message.includes("back to bodyweight"), backoff.message);

  // Back-off edge case: stored added weight but this session logged without weight.
  const backoffNoWeight = run({
    meta: SQUAT_BW,
    sets: sets(4, 7, null), // Below min, no weight
    state: fresh({ currentWorkingWeightKg: 10, consecutiveFailures: 1 }),
  });
  check("stored weight but logged without: still drops to 0",
    backoffNoWeight.nextWorkingWeightKg === 0, `${backoffNoWeight.nextWorkingWeightKg}`);
  check("outcome is backed_off", backoffNoWeight.outcome === "backed_off",
    backoffNoWeight.outcome);

  // Unloaded bodyweight: unchanged behavior (reps progression).
  const unloaded = run({
    meta: PUSHUP,
    sets: sets(4, 12, null),
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 12 }),
  });
  check("unloaded bodyweight still progresses reps to 14",
    unloaded.nextTargetReps === 14, `${unloaded.nextTargetReps}`);
  check("and invents no weight", unloaded.nextWorkingWeightKg === null);

  // Loaded barbell squat: keeps old behavior (5 kg, doubled when easy).
  const loadedBarbell = run({
    meta: SQUAT,
    sets: sets(4, 12, 100),
    state: fresh({ currentWorkingWeightKg: 100 }),
    feel: "easy",
  });
  check("loaded squat with easy still gets doubled: 110 kg",
    loadedBarbell.nextWorkingWeightKg === 110, `${loadedBarbell.nextWorkingWeightKg}`);

  // suggestedWeight rounds to bodyweight step for bodyweight exercises.
  const suggestedBwLower = suggestedWeight(
    { currentWorkingWeightKg: 10 },
    true,
    SQUAT_BW,
    ["dip_belt"],
  );
  check("deload suggestion for bodyweight lower-body rounds to 2.5 kg step",
    suggestedBwLower === 7.5, `${suggestedBwLower}`);

  const suggestedBwUpper = suggestedWeight(
    { currentWorkingWeightKg: 5 },
    true,
    PUSHUP_LOADED,
    ["dip_belt"],
  );
  // 5 * 0.7 = 3.5, rounded to 1.25 kg step is 3.75, then grid-rounded to 2.5 kg (tie rounds down)
  check("deload suggestion for bodyweight upper-body rounds to dip_belt grid (2.5 kg)",
    suggestedBwUpper === 2.5, `${suggestedBwUpper}`);
}

console.log("\n18. No-equipment path matches updated behavior");
{
  // Success progression without equipment
  const success = run({});
  check("success without equipment: 60 -> 62.5", success.nextWorkingWeightKg === 62.5, `${success.nextWorkingWeightKg}`);
  
  // In-range without equipment: holds at current weight
  const inRange = run({ sets: sets(4, 10) });
  check("in-range without equipment: holds at 60", inRange.nextWorkingWeightKg === 60, `${inRange.nextWorkingWeightKg}`);
  check("in-range: failures reset to 0", inRange.consecutiveFailures === 0);
  
  // Hard without equipment: progresses normally
  const hard = run({ feel: "hard" });
  check("hard without equipment: 60 -> 62.5", hard.nextWorkingWeightKg === 62.5, `${hard.nextWorkingWeightKg}`);
  
  // Second real miss (back-off) without equipment: drops ~10%
  const backOff = run({ sets: sets(4, 7), state: fresh({ consecutiveFailures: 1 }) });
  check("back-off without equipment: 60 -> 52.5", backOff.nextWorkingWeightKg === 52.5, `${backOff.nextWorkingWeightKg}`);
  
  // Deload suggestion without equipment
  const deload = suggestedWeight({ currentWorkingWeightKg: 60 }, true, BENCH);
  check("deload suggestion without equipment: 60 -> 42.5", deload === 42.5, `${deload}`);
  
  // No-data without equipment: holds
  const noData = run({ sets: [] });
  check("no-data without equipment: holds at 60", noData.nextWorkingWeightKg === 60, `${noData.nextWorkingWeightKg}`);
  
  // Never negative or zero
  const minIso = run({ meta: CURL, state: fresh({ currentWorkingWeightKg: 2.5 }), sets: sets(4, 7, 2.5) });
  check("min isolation real miss: 2.5 stays 2.5", minIso.nextWorkingWeightKg === 2.5, `${minIso.nextWorkingWeightKg}`);
}

console.log("\n19. With equipment: explicit equipment param tests");
{
  // These tests need equipment for grid snapping
  const curlWithEquip = run({
    meta: CURL,
    sets: sets(4, 12, 15),
    state: fresh({ currentWorkingWeightKg: 15 }),
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("curl 15 kg with dumbbell: 15 -> 17.5", curlWithEquip.nextWorkingWeightKg === 17.5, `${curlWithEquip.nextWorkingWeightKg}`);
  
  const dipWithEquip = run({
    meta: PUSHUP,
    sets: sets(4, 12, 25),
    state: fresh({ currentWorkingWeightKg: 25 }),
    equipmentIds: ["dip_bars"],
    unit: "kg",
  });
  check("dip +25 kg with dip_bars: 25 -> 26.25 (1.25 kg step, no dip_belt mapping)", dipWithEquip.nextWorkingWeightKg === 26.25, `${dipWithEquip.nextWorkingWeightKg}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
